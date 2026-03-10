import type {
  Query,
  Options,
  SDKUserMessage,
  SDKSessionInfo,
  PermissionMode as SDKPermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import {
  query,
  getSessionMessages,
  listSessions as sdkListSessions,
} from "@anthropic-ai/claude-agent-sdk";
import { EventPublisher } from "@orpc/server";
import debug from "debug";
import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type {
  ClaudeCodeUIEvent,
  ClaudeCodeUIMessage,
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
} from "../../../shared/claude-code/types";
import type { ModelScope, SessionInfo } from "../../../shared/features/agent/types";

import { readModelSetting } from "./claude-settings";
import { Pushable } from "./pushable";
import { SDKMessageTransformer, toUIEvent } from "./sdk-message-transformer";
import { getShellEnvironment } from "./shell-env";
import { sessionMessagesToUIMessages } from "./utils/session-messages-to-ui-messages";

const log = debug("neovate:session-manager");

/** List .jsonl files one level deep under `~/.claude/projects/` */
function listSessionFiles(filter?: string): string[] {
  const baseDir = path.join(homedir(), ".claude", "projects");
  let dirs: string[];
  try {
    dirs = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const dir of dirs) {
    try {
      const files = readdirSync(path.join(baseDir, dir));
      for (const f of files) {
        if (filter ? f === filter : f.endsWith(".jsonl")) {
          results.push(path.join(baseDir, dir, f));
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  return results;
}

/** Auto-cancel permission requests after 5 minutes of no UI response. */
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

export class SessionManager {
  // Single global publisher — sessionId is the channel key
  readonly eventPublisher = new EventPublisher<Record<string, ClaudeCodeUIEvent>>();

  // Per-session state
  private sessions = new Map<
    string,
    {
      input: Pushable<SDKUserMessage>;
      query: Query;
      cwd: string;
      pendingRequests: Map<
        string,
        {
          resolve: (result: import("@anthropic-ai/claude-agent-sdk").PermissionResult) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >;
    }
  >();

  private queryOptions({
    sessionId,
    model,
    cwd,
  }: {
    sessionId: string;
    model?: string;
    cwd: string;
  }): Options {
    return {
      sessionId,
      model,
      cwd,
      settingSources: ["local", "project", "user"],
      permissionMode: "default",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      tools: {
        type: "preset",
        preset: "claude_code",
      },
      canUseTool: async (toolName, input, { signal, ...options }) => {
        const requestId = randomUUID();
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);

        const { promise, resolve } =
          Promise.withResolvers<import("@anthropic-ai/claude-agent-sdk").PermissionResult>();
        let settled = false;
        const settle = (result: import("@anthropic-ai/claude-agent-sdk").PermissionResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          session.pendingRequests.delete(requestId);
          // SDK expects updatedInput on allow results to execute the tool
          resolve(
            result.behavior === "allow"
              ? { ...result, updatedInput: result.updatedInput ?? input }
              : result,
          );
        };
        const timer = setTimeout(
          () => settle({ behavior: "deny", message: "Permission request timed out" }),
          PERMISSION_TIMEOUT_MS,
        );
        const onAbort = () => settle({ behavior: "deny", message: "Permission request cancelled" });
        session.pendingRequests.set(requestId, { resolve: settle, timer });
        this.eventPublisher.publish(sessionId, {
          kind: "request",
          requestId,
          request: { type: "permission_request", toolName, input, options },
        });
        signal.addEventListener("abort", onAbort, { once: true });
        return promise;
      },
      stderr(data) {
        console.error("[claude-stderr]", data.trimEnd());
      },
    };
  }

  /** Start a new session. */
  async createSession(
    cwd: string,
    model?: string,
  ): Promise<
    { sessionId: string; currentModel?: string; modelScope?: ModelScope } & Awaited<
      ReturnType<Query["initializationResult"]>
    >
  > {
    const sessionId = randomUUID();
    // Resolve model: explicit param > project/global settings
    const modelSetting = model
      ? { model, scope: "session" as const }
      : readModelSetting(sessionId, cwd);
    const initResult = await this.initSession(sessionId, cwd, { model: modelSetting?.model });
    return {
      ...initResult,
      sessionId,
      currentModel: modelSetting?.model,
      modelScope: modelSetting?.scope,
    };
  }

  /** Resume an existing session, returning converted historical messages. */
  async loadSession(
    sessionId: string,
    cwd: string,
  ): Promise<{
    sessionId: string;
    capabilities: Awaited<ReturnType<Query["initializationResult"]>>;
    messages: ClaudeCodeUIMessage[];
    currentModel?: string;
    modelScope?: ModelScope;
  }> {
    // Read persisted model setting before initializing SDK query
    const modelSetting = readModelSetting(sessionId, cwd);
    const capabilities = await this.initSession(sessionId, cwd, {
      model: modelSetting?.model,
      resume: sessionId,
    });

    const sessionMessages = await getSessionMessages(sessionId);
    const messages = await sessionMessagesToUIMessages(sessionMessages);

    log(
      "loadSession: sessionId=%s raw=%d messages=%d currentModel=%s modelScope=%s",
      sessionId,
      sessionMessages.length,
      messages.length,
      modelSetting?.model ?? "(default)",
      modelSetting?.scope ?? "(none)",
    );

    return {
      sessionId,
      capabilities,
      messages,
      currentModel: modelSetting?.model,
      modelScope: modelSetting?.scope,
    };
  }

  /** Shared session initialization: shell env, query, canUseTool wiring. */
  private async initSession(
    sessionId: string,
    cwd: string,
    opts?: { model?: string; resume?: string },
  ): Promise<Awaited<ReturnType<Query["initializationResult"]>>> {
    const input = new Pushable<SDKUserMessage>();
    const pendingRequests = new Map<
      string,
      {
        resolve: (result: import("@anthropic-ai/claude-agent-sdk").PermissionResult) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();

    const shellEnv = await getShellEnvironment();
    const mergedPath = [shellEnv.PATH, process.env.PATH].filter(Boolean).join(":");
    const env: Record<string, string | undefined> = {
      ...process.env,
      ...shellEnv,
      ...(mergedPath ? { PATH: mergedPath } : {}),
    };

    const queryOpts = this.queryOptions({ sessionId, cwd, model: opts?.model });
    const options: Options = {
      ...queryOpts,
      env,
      permissionMode: "default",
      ...(opts?.resume ? { resume: opts.resume, sessionId: undefined } : {}),
      stderr: (output) => console.error("[claude-stderr]", output.trimEnd()),
    };

    const q = query({ prompt: input, options });
    this.sessions.set(sessionId, { input, query: q, cwd, pendingRequests });

    return q.initializationResult();
  }

  async listSessions(cwd?: string): Promise<SessionInfo[]> {
    const t0 = performance.now();
    log("listSessions: START cwd=%s", cwd);

    const sessions: SDKSessionInfo[] = await sdkListSessions(cwd ? { dir: cwd } : undefined);
    log(
      "listSessions: sdk returned %d sessions in %dms",
      sessions.length,
      Math.round(performance.now() - t0),
    );

    // Build sessionId -> file birthtime map for accurate createdAt
    const sessionFiles = listSessionFiles();
    const birthtimeMap = new Map<string, Date>();
    for (const file of sessionFiles) {
      const id = path.basename(file, ".jsonl");
      try {
        birthtimeMap.set(id, statSync(file).birthtime);
      } catch {
        // ignore stat errors
      }
    }

    const result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.customTitle ?? s.summary ?? s.firstPrompt?.slice(0, 50),
      cwd: s.cwd,
      updatedAt: new Date(s.lastModified).toISOString(),
      createdAt: (birthtimeMap.get(s.sessionId) ?? new Date(s.lastModified)).toISOString(),
    }));

    log("listSessions: DONE in %dms count=%d", Math.round(performance.now() - t0), result.length);
    return result;
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    log("renameSession: sessionId=%s title=%s", sessionId, title);
    const matches = listSessionFiles(`${sessionId}.jsonl`);
    if (matches.length === 0) {
      throw new Error(`Session file not found: ${sessionId}`);
    }
    const entry = JSON.stringify({ type: "custom-title", customTitle: title, sessionId });
    await appendFile(matches[0], entry + "\n");
    log("renameSession: DONE sessionId=%s", sessionId);
  }

  getSessionCwd(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session.cwd;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log("closeSession: no-op, unknown sessionId=%s", sessionId);
      return;
    }
    session.query.close();
    for (const [, pending] of session.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ behavior: "deny", message: "Session closed" });
    }
    this.sessions.delete(sessionId);
    log("closeSession: closed sessionId=%s remainingSessions=%d", sessionId, this.sessions.size);
  }

  async closeAll(): Promise<void> {
    log("closeAll: START sessions=%d", this.sessions.size);
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    log("closeAll: DONE");
  }

  /**
   * Stream a user message as UIMessageChunks.
   * Events from the SDK are routed to the event publisher.
   */
  async *stream(
    sessionId: string,
    message: import("../../../shared/claude-code/types").ClaudeCodeUIMessage,
  ): AsyncGenerator<import("../../../shared/claude-code/types").ClaudeCodeUIMessageChunk> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const transformer = new SDKMessageTransformer();

    // UIMessage -> SDKUserMessage: extract text + image parts
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    const imageBlocks = message.parts
      .filter(
        (p): p is { type: "file"; mediaType: string; url: string } =>
          p.type === "file" &&
          typeof (p as any).mediaType === "string" &&
          (p as any).mediaType.startsWith("image/"),
      )
      .map((p) => {
        const base64 = p.url.startsWith("data:") ? p.url.split(",")[1] : p.url;
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: p.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        };
      });

    const content =
      imageBlocks.length > 0
        ? [...(text ? [{ type: "text" as const, text }] : []), ...imageBlocks]
        : text;

    session.input.push({
      type: "user",
      message: { role: "user", content },
      parent_tool_use_id: null,
      session_id: sessionId,
    });

    while (true) {
      const { value, done } = await session.query.next();
      if (done || !value) break;

      // Publish to subscribe stream (result event included — carries cost/usage/stop_reason)
      const event = toUIEvent(value);
      if (event) {
        this.eventPublisher.publish(sessionId, event);
      }

      // Route to message stream (result → finish-step + finish, error → error chunk)
      for (const chunk of transformer.transform(value)) {
        yield chunk;
      }

      // Break AFTER transformer so finish/finish-step chunks are sent before closing the stream
      if (value.type === "result") break;
    }
  }

  /** Handle dispatch — respond to permission request or configure session */
  handleDispatch(sessionId: string, dispatch: ClaudeCodeUIDispatch): ClaudeCodeUIDispatchResult {
    if (dispatch.kind === "respond") {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Unknown session: ${sessionId}`);
      const pending = session.pendingRequests.get(dispatch.requestId);
      if (!pending) {
        log("handleDispatch: unknown requestId=%s knownIds=%o", dispatch.requestId, [
          ...session.pendingRequests.keys(),
        ]);
        return { kind: "respond", ok: false };
      }
      pending.resolve(dispatch.respond.result);
      session.pendingRequests.delete(dispatch.requestId);
      clearTimeout(pending.timer);
      return { kind: "respond", ok: true };
    }
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);

    if (dispatch.kind === "interrupt") {
      log("handleDispatch: interrupt sessionId=%s", sessionId);
      session.query.interrupt();
      return { kind: "interrupt", ok: true };
    }

    if (dispatch.kind === "configure") {
      const { configure } = dispatch;
      log("handleDispatch: configure type=%s", configure.type);
      switch (configure.type) {
        case "set_permission_mode": {
          log(
            "handleDispatch: set_permission_mode sessionId=%s mode=%s",
            sessionId,
            configure.mode,
          );
          session.query.setPermissionMode(configure.mode as SDKPermissionMode);
          return { kind: "configure", ok: true, configure };
        }
        case "set_model": {
          log("handleDispatch: set_model sessionId=%s model=%s", sessionId, configure.model);
          session.query.setModel(configure.model);
          return { kind: "configure", ok: true, configure };
        }
      }
    }

    return { kind: "configure", ok: false, configure: (dispatch as any).configure };
  }
}
