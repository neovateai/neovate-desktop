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
  CanUseTool,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import debug from "debug";
import type {
  StreamEvent,
  SessionInfo,
  SlashCommandInfo,
} from "../../../shared/features/agent/types";
import { getShellEnvironment } from "./shell-env";
import { Pushable } from "./pushable";

const log = debug("neovate:session-manager");

/** Auto-cancel permission requests after 5 minutes of no UI response. */
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

type ManagedSession = {
  query: Query;
  input: Pushable<SDKUserMessage>;
  cwd: string;
};

type PendingPermission = {
  resolve: (allowed: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PermissionEmitter = (event: StreamEvent) => void;

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private pendingPermissions = new Map<string, PendingPermission>();
  private requestIdCounter = 0;
  private permissionEmitter: PermissionEmitter | null = null;

  private async buildOptions(cwd: string, model?: string): Promise<Options> {
    const t0 = performance.now();
    const shellEnv = await getShellEnvironment();
    const shellEnvMs = Math.round(performance.now() - t0);
    log("buildOptions: shellEnv resolved in %dms keys=%o", shellEnvMs, Object.keys(shellEnv));

    const mergedPath = [shellEnv.PATH, process.env.PATH].filter(Boolean).join(":");
    log("buildOptions: mergedPath length=%d", mergedPath.length);

    const env: Record<string, string | undefined> = {
      ...process.env,
      ...shellEnv,
      ...(mergedPath ? { PATH: mergedPath } : {}),
    };

    const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
      const requestId = String(++this.requestIdCounter);
      log(
        "canUseTool: requestId=%s tool=%s inputKeys=%o pendingCount=%d",
        requestId,
        toolName,
        Object.keys(input),
        this.pendingPermissions.size,
      );

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.pendingPermissions.delete(requestId);
          log(
            "canUseTool: TIMEOUT requestId=%s tool=%s (after %dms)",
            requestId,
            toolName,
            PERMISSION_TIMEOUT_MS,
          );
          resolve({ behavior: "deny", message: "Permission request timed out" });
        }, PERMISSION_TIMEOUT_MS);

        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            this.pendingPermissions.delete(requestId);
            log("canUseTool: ABORTED requestId=%s tool=%s", requestId, toolName);
            resolve({ behavior: "deny", message: "Permission request cancelled" });
          },
          { once: true },
        );

        this.pendingPermissions.set(requestId, {
          resolve: (allowed) => {
            clearTimeout(timer);
            this.pendingPermissions.delete(requestId);
            log(
              "canUseTool: RESOLVED requestId=%s tool=%s allowed=%s",
              requestId,
              toolName,
              allowed,
            );
            if (allowed) {
              resolve({ behavior: "allow" });
            } else {
              resolve({ behavior: "deny", message: "User denied permission" });
            }
          },
          timer,
        });

        // Emit permission request event for the renderer
        if (this.permissionEmitter) {
          log("canUseTool: emitting permission_request to renderer requestId=%s", requestId);
          this.permissionEmitter({
            type: "permission_request",
            requestId,
            toolName,
            input,
          });
        } else {
          log(
            "canUseTool: WARNING no permissionEmitter set, requestId=%s will hang until timeout",
            requestId,
          );
        }
      });
    };

    const resolvedModel = model ?? "sonnet";
    log("buildOptions: model=%s permissionMode=default", resolvedModel);

    return {
      model: resolvedModel,
      cwd,
      env,
      canUseTool,
      permissionMode: "default",
    };
  }

  async createSession(
    cwd: string,
    model?: string,
  ): Promise<{ sessionId: string; commands?: SlashCommandInfo[] }> {
    const t0 = performance.now();
    log("createSession: START cwd=%s model=%s activeSessions=%d", cwd, model, this.sessions.size);

    const options = await this.buildOptions(cwd, model);
    log("createSession: options built in %dms", Math.round(performance.now() - t0));

    const sessionId = randomUUID();
    const input = new Pushable<SDKUserMessage>();
    const q = query({ prompt: input, options: { ...options, sessionId } });

    this.sessions.set(sessionId, { query: q, input, cwd });
    log("createSession: query created, awaiting init");

    const initResult = await q.initializationResult();
    log(
      "createSession: init received — commands=%d model=%s",
      initResult.commands?.length ?? 0,
      options.model,
    );

    const commands: SlashCommandInfo[] = (initResult.commands ?? []).map((cmd) => ({
      name: cmd.name,
    }));

    log(
      "createSession: DONE in %dms sessionId=%s commands=%d activeSessions=%d",
      Math.round(performance.now() - t0),
      sessionId,
      commands.length,
      this.sessions.size,
    );

    return {
      sessionId,
      commands: commands.length > 0 ? commands : undefined,
    };
  }

  async *prompt(
    sessionId: string,
    text: string,
    emitter: (event: StreamEvent) => void,
  ): AsyncGenerator<StreamEvent> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      log("prompt: ERROR unknown sessionId=%s knownSessions=%o", sessionId, [
        ...this.sessions.keys(),
      ]);
      throw new Error(`Unknown session: ${sessionId}`);
    }

    const t0 = performance.now();
    log("prompt: START sessionId=%s promptLen=%d cwd=%s", sessionId, text.length, managed.cwd);

    // Set permission emitter so canUseTool can forward events
    this.permissionEmitter = emitter;
    let eventCount = 0;
    let sdkMsgCount = 0;

    try {
      managed.input.push({
        type: "user",
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        session_id: sessionId,
      });
      log("prompt: message pushed in %dms", Math.round(performance.now() - t0));

      while (true) {
        const { value: msg, done } = await managed.query.next();
        if (done || !msg) break;

        sdkMsgCount++;
        if (sdkMsgCount <= 20) {
          log(
            "prompt: sdk msg #%d type=%s subtype=%s sessionId=%s",
            sdkMsgCount,
            msg.type,
            "subtype" in msg ? (msg as any).subtype : "-",
            sessionId,
          );
        }
        for (const event of this.convertSdkMessage(sessionId, msg)) {
          eventCount++;
          yield event;
        }
        if (msg.type === "result") break;
      }
    } catch (error) {
      log(
        "prompt: ERROR sessionId=%s after %dms sdkMsgs=%d events=%d error=%s",
        sessionId,
        Math.round(performance.now() - t0),
        sdkMsgCount,
        eventCount,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      this.permissionEmitter = null;
      log(
        "prompt: DONE sessionId=%s in %dms sdkMsgs=%d events=%d",
        sessionId,
        Math.round(performance.now() - t0),
        sdkMsgCount,
        eventCount,
      );
    }
  }

  async *loadSession(
    sessionId: string,
    cwd?: string,
    emitter?: (event: StreamEvent) => void,
    skipReplay?: boolean,
  ): AsyncGenerator<StreamEvent> {
    const t0 = performance.now();
    log("loadSession: START sessionId=%s cwd=%s skipReplay=%s", sessionId, cwd, !!skipReplay);

    const resolvedCwd = cwd ?? process.cwd();
    const options = await this.buildOptions(resolvedCwd);
    log(
      "loadSession: options built in %dms, creating query with resume",
      Math.round(performance.now() - t0),
    );

    const input = new Pushable<SDKUserMessage>();
    const q = query({ prompt: input, options: { ...options, resume: sessionId } });
    this.sessions.set(sessionId, { query: q, input, cwd: resolvedCwd });

    if (emitter) {
      this.permissionEmitter = emitter;
    }

    let eventCount = 0;

    try {
      // Wait for initialization
      const initResult = await q.initializationResult();
      log("loadSession: init received in %dms", Math.round(performance.now() - t0));

      // Emit available commands
      const commands: SlashCommandInfo[] = (initResult.commands ?? []).map((cmd) => ({
        name: cmd.name,
      }));
      if (commands.length > 0) {
        eventCount++;
        yield { type: "available_commands", sessionId, commands };
      }

      // Replay history from persisted messages (skip if renderer has cache)
      if (!skipReplay) {
        const messages = await getSessionMessages(sessionId);
        log("loadSession: replaying %d historical messages", messages.length);

        for (const msg of messages) {
          for (const event of this.convertReplayMessage(sessionId, msg)) {
            eventCount++;
            yield event;
          }
        }
      } else {
        log("loadSession: skipReplay=true, skipping message replay");
      }
    } catch (error) {
      log(
        "loadSession: ERROR sessionId=%s after %dms events=%d error=%s",
        sessionId,
        Math.round(performance.now() - t0),
        eventCount,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      if (emitter) {
        this.permissionEmitter = null;
      }
    }

    log(
      "loadSession: DONE sessionId=%s in %dms events=%d",
      sessionId,
      Math.round(performance.now() - t0),
      eventCount,
    );
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

    if (sessions.length > 0 && sessions.length <= 20) {
      for (const s of sessions) {
        log(
          "listSessions:   id=%s title=%s cwd=%s lastModified=%s size=%d",
          s.sessionId.slice(0, 8),
          (s.customTitle ?? s.summary ?? s.firstPrompt ?? "").slice(0, 40),
          s.cwd,
          new Date(s.lastModified).toISOString(),
          s.fileSize,
        );
      }
    }

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

  resolvePermission(requestId: string, allow: boolean): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      log(
        "resolvePermission: UNKNOWN requestId=%s (pending=%d)",
        requestId,
        this.pendingPermissions.size,
      );
      return;
    }
    log(
      "resolvePermission: requestId=%s allow=%s pendingBefore=%d",
      requestId,
      allow,
      this.pendingPermissions.size,
    );
    pending.resolve(allow);
  }

  async cancel(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      log("cancel: no-op, unknown sessionId=%s", sessionId);
      return;
    }
    log("cancel: interrupting sessionId=%s", sessionId);
    await managed.query.interrupt();
  }

  async closeSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      log("closeSession: no-op, unknown sessionId=%s", sessionId);
      return;
    }
    managed.query.close();
    this.sessions.delete(sessionId);
    log("closeSession: closed sessionId=%s remainingSessions=%d", sessionId, this.sessions.size);
  }

  async closeAll(): Promise<void> {
    log(
      "closeAll: START sessions=%d pendingPermissions=%d",
      this.sessions.size,
      this.pendingPermissions.size,
    );
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    // Cancel pending permissions
    for (const [id, pending] of this.pendingPermissions) {
      clearTimeout(pending.timer);
      pending.resolve(false);
      this.pendingPermissions.delete(id);
    }
    log("closeAll: DONE");
  }

  private *convertReplayMessage(sessionId: string, msg: SessionMessage): Generator<StreamEvent> {
    const message = msg.message as any;

    if (msg.type === "user") {
      const content = message.content;
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
      }
      if (text) {
        log("convertReplay: user_message len=%d uuid=%s", text.length, msg.uuid);
        yield { type: "user_message", sessionId, text };
      }
    } else if (msg.type === "assistant") {
      const blocks = message.content;
      if (Array.isArray(blocks)) {
        log("convertReplay: assistant blocks=%d uuid=%s", blocks.length, msg.uuid);
        for (const block of blocks) {
          if (block.type === "text") {
            yield { type: "text_delta", sessionId, text: block.text };
          }
          if (block.type === "thinking" && "thinking" in block) {
            yield { type: "thinking_delta", sessionId, text: block.thinking };
          }
          if (block.type === "tool_use") {
            yield {
              type: "tool_use",
              sessionId,
              toolId: block.id,
              name: block.name,
              status: "completed",
            };
          }
        }
      }
    }
  }

  private *convertSdkMessage(sessionId: string, msg: SDKMessage): Generator<StreamEvent> {
    switch (msg.type) {
      case "stream_event": {
        // SDKPartialAssistantMessage — streaming text/thinking deltas
        const event = msg.event;
        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if ("text" in delta && typeof delta.text === "string") {
            log("convert: text_delta len=%d sessionId=%s", delta.text.length, sessionId);
            yield { type: "text_delta", sessionId, text: delta.text };
          }
          if ("thinking" in delta && typeof delta.thinking === "string") {
            log("convert: thinking_delta len=%d sessionId=%s", delta.thinking.length, sessionId);
            yield { type: "thinking_delta", sessionId, text: delta.thinking };
          }
        } else {
          log("convert: stream_event subtype=%s (not content_block_delta)", event.type);
        }
        break;
      }

      case "assistant": {
        // SDKAssistantMessage — full message (replay)
        const blocks = msg.message.content;
        log(
          "convert: assistant replay blocks=%d error=%s uuid=%s",
          blocks.length,
          msg.error ?? "none",
          msg.uuid,
        );
        for (const block of blocks) {
          if (block.type === "text") {
            log("convert:   text block len=%d", block.text.length);
            yield { type: "text_delta", sessionId, text: block.text };
          }
          if (block.type === "thinking" && "thinking" in block) {
            const thinking = (block as { thinking: string }).thinking;
            log("convert:   thinking block len=%d", thinking.length);
            yield { type: "thinking_delta", sessionId, text: thinking };
          }
          if (block.type === "tool_use") {
            log("convert:   tool_use block id=%s name=%s", block.id, block.name);
            yield {
              type: "tool_use",
              sessionId,
              toolId: block.id,
              name: block.name,
              status: "completed",
            };
          }
        }
        break;
      }

      case "tool_progress": {
        log(
          "convert: tool_progress id=%s name=%s elapsed=%ds",
          msg.tool_use_id,
          msg.tool_name,
          msg.elapsed_time_seconds,
        );
        yield {
          type: "tool_use",
          sessionId,
          toolId: msg.tool_use_id,
          name: msg.tool_name,
          status: "running",
        };
        break;
      }

      case "tool_use_summary": {
        log("convert: tool_use_summary (skipped) summary=%s", msg.summary.slice(0, 60));
        break;
      }

      case "user": {
        const content = msg.message.content;
        let text = "";
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b) => b.type === "text")
            .map((b) => (b as { text: string }).text)
            .join("");
        }
        const isReplay = "isReplay" in msg && msg.isReplay;
        log(
          "convert: user_message len=%d replay=%s uuid=%s",
          text.length,
          isReplay,
          msg.uuid ?? "-",
        );
        if (text) {
          yield { type: "user_message", sessionId, text };
        }
        break;
      }

      case "result": {
        const stopReason = msg.stop_reason ?? (msg.is_error ? "error" : "end_turn");
        log(
          "convert: result stopReason=%s isError=%s numTurns=%d durationMs=%d costUsd=%s",
          stopReason,
          msg.is_error,
          msg.num_turns,
          msg.duration_ms,
          msg.total_cost_usd,
        );
        yield { type: "result", sessionId, stopReason };
        break;
      }

      case "system": {
        const subtype = "subtype" in msg ? (msg as any).subtype : "unknown";
        log("convert: system subtype=%s sessionId=%s", subtype, sessionId);
        if ("subtype" in msg) {
          if (msg.subtype === "status") {
            const statusMsg = msg as Extract<SDKMessage, { type: "system"; subtype: "status" }>;
            log(
              "convert:   status=%s permissionMode=%s",
              statusMsg.status,
              statusMsg.permissionMode,
            );
            yield {
              type: "status",
              sessionId,
              message: statusMsg.status ?? "",
            };
          }
          if (msg.subtype === "init") {
            const initMsg = msg as Extract<SDKMessage, { type: "system"; subtype: "init" }>;
            const commands: SlashCommandInfo[] = (initMsg.slash_commands ?? []).map((name) => ({
              name,
            }));
            log(
              "convert:   init model=%s tools=%d commands=%d cwd=%s",
              initMsg.model,
              initMsg.tools?.length ?? 0,
              commands.length,
              initMsg.cwd,
            );
            if (commands.length > 0) {
              yield { type: "available_commands", sessionId, commands };
            }
          }
        }
        break;
      }

      default: {
        log("convert: UNHANDLED sdk msg type=%s sessionId=%s", msg.type, sessionId);
        break;
      }
    }
  }
}
