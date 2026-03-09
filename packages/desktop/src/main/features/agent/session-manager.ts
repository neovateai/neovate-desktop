import {
  query,
  getSessionMessages,
  listSessions as sdkListSessions,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  Query,
  Options,
  SDKMessage,
  SDKUserMessage,
  SDKSessionInfo,
  SessionMessage,
  PermissionMode as SDKPermissionMode,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import debug from "debug";
import type { SessionInfo } from "../../../shared/features/agent/types";
import { getShellEnvironment } from "./shell-env";
import { EventPublisher } from "@orpc/server";
import { Pushable } from "./pushable";
import type {
  ClaudeCodeUIEvent,
  ClaudeCodeUIMessage,
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
} from "../../../shared/claude-code/types";
import { createUIMessageStream, readUIMessageStream } from "ai";
import { SDKMessageTransformer, toUIEvent } from "./sdk-message-transformer";

const log = debug("neovate:session-manager");

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
  ): Promise<{ sessionId: string } & Awaited<ReturnType<Query["initializationResult"]>>> {
    const sessionId = randomUUID();
    const initResult = await this.initSession(sessionId, cwd, { model });
    return { ...initResult, sessionId };
  }

  /** Resume an existing session, returning converted historical messages. */
  async loadSession(
    sessionId: string,
    cwd: string,
  ): Promise<{
    sessionId: string;
    capabilities: Awaited<ReturnType<Query["initializationResult"]>>;
    messages: ClaudeCodeUIMessage[];
  }> {
    const capabilities = await this.initSession(sessionId, cwd, { resume: sessionId });

    const sessionMessages = await getSessionMessages(sessionId);
    const messages = await this.toUIMessages(sessionMessages);

    log(
      "loadSession: sessionId=%s raw=%d messages=%d",
      sessionId,
      sessionMessages.length,
      messages.length,
    );

    return { sessionId, capabilities, messages };
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

    const queryOpts = this.queryOptions({ sessionId, cwd, model: opts?.model ?? "sonnet" });
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

    const result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.customTitle ?? s.summary ?? s.firstPrompt?.slice(0, 50),
      cwd: s.cwd,
      updatedAt: new Date(s.lastModified).toISOString(),
      createdAt: new Date(s.lastModified).toISOString(),
    }));

    log("listSessions: DONE in %dms count=%d", Math.round(performance.now() - t0), result.length);
    return result;
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    log("renameSession: sessionId=%s title=%s", sessionId, title);
    const matches = globSync(
      path.join(homedir(), ".claude", "projects", "*", `${sessionId}.jsonl`),
    );
    if (matches.length === 0) {
      throw new Error(`Session file not found: ${sessionId}`);
    }
    const entry = JSON.stringify({ type: "custom-title", customTitle: title, sessionId });
    await appendFile(matches[0], entry + "\n");
    log("renameSession: DONE sessionId=%s", sessionId);
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

  /** Convert SDK SessionMessages to ClaudeCodeUIMessages, split by human prompt boundaries. */
  private async toUIMessages(sessionMessages: SessionMessage[]): Promise<ClaudeCodeUIMessage[]> {
    const results: ClaudeCodeUIMessage[] = [];
    let batch: SessionMessage[] = [];

    const flushBatch = async () => {
      if (batch.length === 0) return;
      const batchCopy = batch;
      batch = [];
      const transformer = new SDKMessageTransformer();

      const stream = createUIMessageStream<ClaudeCodeUIMessage>({
        execute({ writer }) {
          for (const msg of batchCopy) {
            for (const chunk of transformer.transform(msg as SDKMessage)) {
              writer.write(chunk);
            }
          }
        },
      });

      const messageStream = readUIMessageStream<ClaudeCodeUIMessage>({ stream });
      let last: ClaudeCodeUIMessage | undefined;
      for await (const msg of messageStream) {
        last = msg;
      }
      if (last) results.push(last);
    };

    for (const msg of sessionMessages) {
      const content = (msg as any).message?.content;
      const isHumanPrompt =
        msg.type === "user" && typeof content === "string" && !content.startsWith("<");

      if (isHumanPrompt) {
        await flushBatch();
        results.push({
          id: (msg as any).uuid ?? crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: content, state: "done" }],
          metadata: { sessionId: (msg as any).session_id, parentToolUseId: null },
        } as ClaudeCodeUIMessage);
      } else {
        batch.push(msg);
      }
    }

    await flushBatch();
    return results;
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

    // TODO: UIMessage -> SDKUserMessage abstraction
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    session.input.push({
      type: "user",
      message: { role: "user", content: text },
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
