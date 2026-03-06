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
  UIMessagePart,
  SessionInfo,
  SlashCommandInfo,
  ImageAttachment,
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

type PermissionEmitter = (event: UIMessagePart) => void;

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private pendingPermissions = new Map<string, PendingPermission>();
  private requestIdCounter = 0;
  private permissionEmitter: PermissionEmitter | null = null;
  /** Current active session ID for permission requests */
  private activeSessionId: string | null = null;

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
        if (this.permissionEmitter && this.activeSessionId) {
          log("canUseTool: emitting permission_request to renderer requestId=%s", requestId);
          this.permissionEmitter({
            type: "data-permission-request",
            data: {
              requestId,
              toolName,
              input,
            },
          });
        } else {
          log(
            "canUseTool: WARNING no permissionEmitter or activeSessionId set, activeSessionId=%s requestId=%s will hang until timeout",
            this.activeSessionId,
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
      settingSources: ["user", "project", "local"],
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
      description: cmd.description,
      argumentHint: cmd.argumentHint,
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
    emitter: (event: UIMessagePart) => void,
    attachments?: ImageAttachment[],
  ): AsyncGenerator<UIMessagePart> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      log("prompt: ERROR unknown sessionId=%s knownSessions=%o", sessionId, [
        ...this.sessions.keys(),
      ]);
      throw new Error(`Unknown session: ${sessionId}`);
    }

    const t0 = performance.now();
    log(
      "prompt: START sessionId=%s promptLen=%d cwd=%s attachments=%d",
      sessionId,
      text.length,
      managed.cwd,
      attachments?.length ?? 0,
    );
    if (attachments && attachments.length > 0) {
      log(
        "prompt: attachment details: %o",
        attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          mediaType: a.mediaType,
          base64Len: a.base64?.length ?? 0,
        })),
      );
    }

    // Set active session and permission emitter so canUseTool can forward events
    this.activeSessionId = sessionId;
    this.permissionEmitter = emitter;
    let eventCount = 0;
    let sdkMsgCount = 0;

    try {
      const content =
        attachments && attachments.length > 0
          ? [
              ...(text ? [{ type: "text" as const, text }] : []),
              ...attachments.map((att) => ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: att.mediaType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/gif"
                    | "image/webp",
                  data: att.base64,
                },
              })),
            ]
          : text;

      log(
        "prompt: content type=%s contentIsArray=%s blockCount=%s",
        typeof content,
        Array.isArray(content),
        Array.isArray(content) ? content.length : "n/a",
      );
      if (Array.isArray(content)) {
        log(
          "prompt: content blocks: %o",
          content.map((b) => ({
            type: b.type,
            ...(b.type === "text" ? { textLen: b.text.length } : {}),
            ...(b.type === "image"
              ? {
                  sourceType: b.source.type,
                  mediaType: b.source.media_type,
                  dataLen: b.source.data?.length ?? 0,
                }
              : {}),
          })),
        );
      }

      managed.input.push({
        type: "user",
        message: { role: "user", content },
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
      this.activeSessionId = null;
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
    emitter?: (event: UIMessagePart) => void,
    skipReplay?: boolean,
  ): AsyncGenerator<UIMessagePart> {
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

    // Set active session and permission emitter
    this.activeSessionId = sessionId;
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
        description: cmd.description,
        argumentHint: cmd.argumentHint,
      }));
      if (commands.length > 0) {
        eventCount++;
        yield { type: "data-available-commands", data: { commands } };
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
      this.activeSessionId = null;
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

  private *convertReplayMessage(sessionId: string, msg: SessionMessage): Generator<UIMessagePart> {
    const message = msg.message as any;
    const parentToolUseId: string | undefined = msg.parent_tool_use_id ?? undefined;
    const providerMetadata = { context: { sessionId } };

    if (msg.type === "user") {
      const content = message.content;
      let text = "";
      let images: Array<{ mediaType: string; base64: string }> | undefined;
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        const imageBlocks = content.filter((b: any) => b.type === "image");
        if (imageBlocks.length > 0) {
          images = imageBlocks.map((b: any) => ({
            mediaType: b.source?.media_type ?? "image/png",
            base64: b.source?.data ?? "",
          }));
        }
        // Emit structured tool_result as dynamic-tool parts
        for (const block of content) {
          if (block.type === "tool_result") {
            const resultContent =
              typeof block.content === "string"
                ? block.content
                : Array.isArray(block.content)
                  ? block.content
                      .filter((c: any) => c.type === "text")
                      .map((c: any) => c.text)
                      .join("")
                  : "";
            if (block.is_error) {
              yield {
                type: "dynamic-tool",
                toolCallId: block.tool_use_id,
                toolName: "",
                state: "output-error",
                input: undefined,
                errorText: resultContent,
                providerExecuted: true,
                callProviderMetadata: providerMetadata,
              };
            } else {
              yield {
                type: "dynamic-tool",
                toolCallId: block.tool_use_id,
                toolName: "",
                state: "output-available",
                input: undefined,
                output: resultContent,
                providerExecuted: true,
                callProviderMetadata: providerMetadata,
              };
            }
          }
        }
      }
      if (text || images) {
        log(
          "convertReplay: user_message len=%d images=%d uuid=%s",
          text.length,
          images?.length ?? 0,
          msg.uuid,
        );
        // Yield text part
        if (text) {
          yield { type: "text", text, state: "done", providerMetadata };
        }
        // Yield file parts for images
        if (images) {
          for (const img of images) {
            yield {
              type: "file",
              mediaType: img.mediaType,
              url: `data:${img.mediaType};base64,${img.base64}`,
              providerMetadata,
            };
          }
        }
      }
    } else if (msg.type === "assistant") {
      const blocks = message.content;
      if (Array.isArray(blocks)) {
        log("convertReplay: assistant blocks=%d uuid=%s", blocks.length, msg.uuid);
        for (const block of blocks) {
          if (block.type === "text") {
            yield { type: "text", text: block.text, state: "done", providerMetadata };
          }
          if (block.type === "thinking" && "thinking" in block) {
            yield { type: "reasoning", text: block.thinking, state: "done", providerMetadata };
          }
          if (block.type === "tool_use") {
            yield {
              type: "dynamic-tool",
              toolCallId: block.id,
              toolName: block.name,
              state: "input-available",
              input: block.input ?? {},
              providerExecuted: true,
              callProviderMetadata: {
                context: { sessionId, parentToolUseId },
              },
            };
          }
        }
      }
    }
  }

  /**
   * Convert SDK message to UIMessagePart types.
   */
  private *convertSdkMessage(sessionId: string, msg: SDKMessage): Generator<UIMessagePart> {
    const providerMetadata = { context: { sessionId } };

    switch (msg.type) {
      case "stream_event": {
        // SDKPartialAssistantMessage — streaming text/thinking deltas
        const event = msg.event;
        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if ("text" in delta && typeof delta.text === "string") {
            log("convert: text_delta len=%d sessionId=%s", delta.text.length, sessionId);
            yield { type: "text", text: delta.text, state: "streaming", providerMetadata };
          }
          if ("thinking" in delta && typeof delta.thinking === "string") {
            log("convert: thinking_delta len=%d sessionId=%s", delta.thinking.length, sessionId);
            yield { type: "reasoning", text: delta.thinking, state: "streaming", providerMetadata };
          }
        } else if (event.type === "content_block_start") {
          // Tool use started - emit input-streaming state
          const block = "content_block" in event ? event.content_block : null;
          if (block && block.type === "tool_use") {
            log("convert: content_block_start tool=%s id=%s", block.name, block.id);
            yield {
              type: "dynamic-tool",
              toolCallId: block.id,
              toolName: block.name,
              state: "input-streaming",
              input: undefined,
              providerExecuted: true,
              callProviderMetadata: providerMetadata,
            };
          }
        } else {
          log("convert: stream_event subtype=%s (not content_block_delta)", event.type);
        }
        break;
      }

      case "assistant": {
        // SDKAssistantMessage — full message (replay)
        const blocks = msg.message.content;
        const parentId: string | undefined = msg.parent_tool_use_id ?? undefined;
        log(
          "convert: assistant replay blocks=%d error=%s uuid=%s",
          blocks.length,
          msg.error ?? "none",
          msg.uuid,
        );
        for (const block of blocks) {
          if (block.type === "text") {
            log("convert: text block len=%d", block.text.length);
            yield { type: "text", text: block.text, state: "done", providerMetadata };
          }
          if (block.type === "thinking" && "thinking" in block) {
            const thinking = (block as { thinking: string }).thinking;
            log("convert: thinking block len=%d", thinking.length);
            yield { type: "reasoning", text: thinking, state: "done", providerMetadata };
          }
          if (block.type === "tool_use") {
            log("convert: tool_use block id=%s name=%s", block.id, block.name);
            yield {
              type: "dynamic-tool",
              toolCallId: block.id,
              toolName: block.name,
              state: "input-available",
              input: block.input ?? {},
              providerExecuted: true,
              callProviderMetadata: {
                context: { sessionId, parentToolUseId: parentId },
              },
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
          type: "dynamic-tool",
          toolCallId: msg.tool_use_id,
          toolName: msg.tool_name,
          state: "input-streaming",
          input: undefined,
          providerExecuted: true,
          callProviderMetadata: providerMetadata,
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
        let imageCount = 0;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b) => b.type === "text")
            .map((b) => (b as { text: string }).text)
            .join("");

          // Handle image blocks as FileUIPart
          const imageBlocks = content.filter((b) => b.type === "image");
          imageCount = imageBlocks.length;
          for (const block of imageBlocks) {
            const imgBlock = block as {
              source?: { media_type?: string; data?: string };
            };
            const mediaType = imgBlock.source?.media_type ?? "image/png";
            const base64Data = imgBlock.source?.data ?? "";
            log("convert: image block mediaType=%s dataLen=%d", mediaType, base64Data.length);
            yield {
              type: "file",
              mediaType,
              url: `data:${mediaType};base64,${base64Data}`,
              providerMetadata,
            };
          }

          // Handle tool_result blocks - update tool state to output-available or output-error
          for (const block of content) {
            if (block.type === "tool_result") {
              const resultBlock = block as {
                tool_use_id: string;
                content: unknown;
                is_error?: boolean;
              };
              const resultContent =
                typeof resultBlock.content === "string"
                  ? resultBlock.content
                  : Array.isArray(resultBlock.content)
                    ? (resultBlock.content as Array<{ type: string; text?: string }>)
                        .filter((c) => c.type === "text")
                        .map((c) => c.text ?? "")
                        .join("")
                    : "";

              if (resultBlock.is_error) {
                log("convert: tool_result error id=%s", resultBlock.tool_use_id);
                yield {
                  type: "dynamic-tool",
                  toolCallId: resultBlock.tool_use_id,
                  toolName: "", // Unknown at this point
                  state: "output-error",
                  input: undefined,
                  errorText: resultContent,
                  providerExecuted: true,
                  callProviderMetadata: providerMetadata,
                };
              } else {
                log("convert: tool_result available id=%s", resultBlock.tool_use_id);
                yield {
                  type: "dynamic-tool",
                  toolCallId: resultBlock.tool_use_id,
                  toolName: "", // Unknown at this point
                  state: "output-available",
                  input: undefined,
                  output: resultContent,
                  providerExecuted: true,
                  callProviderMetadata: providerMetadata,
                };
              }
            }
          }
        }

        const isReplay = "isReplay" in msg && msg.isReplay;
        log(
          "convert: user_message len=%d images=%d replay=%s uuid=%s",
          text.length,
          imageCount,
          isReplay,
          msg.uuid ?? "-",
        );
        // User text as text part
        if (text) {
          yield { type: "text", text, state: "done", providerMetadata };
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
        // Emit as data-result for custom handling
        yield {
          type: "data-result",
          data: {
            stopReason,
            costUsd: msg.total_cost_usd,
            durationMs: msg.duration_ms,
            inputTokens: msg.usage?.input_tokens,
            outputTokens: msg.usage?.output_tokens,
            isError: msg.is_error,
            errors: "errors" in msg ? (msg as { errors?: string[] }).errors : undefined,
          },
          providerMetadata,
        } as UIMessagePart;
        break;
      }

      case "system": {
        const subtype = "subtype" in msg ? (msg as { subtype?: string }).subtype : "unknown";
        log("convert: system subtype=%s sessionId=%s", subtype, sessionId);

        if (subtype === "status") {
          const statusMsg = msg as { status?: string; permissionMode?: string };
          log("convert:   status=%s permissionMode=%s", statusMsg.status, statusMsg.permissionMode);
          yield {
            type: "data-status",
            data: { message: statusMsg.status ?? "" },
            providerMetadata,
          } as UIMessagePart;
        }

        if (subtype === "task_started") {
          const taskMsg = msg as {
            task_id: string;
            description: string;
            task_type?: string;
          };
          log("convert:   task_started id=%s desc=%s", taskMsg.task_id, taskMsg.description);
          yield {
            type: "data-task-started",
            data: {
              taskId: taskMsg.task_id,
              description: taskMsg.description,
              taskType: taskMsg.task_type,
            },
            providerMetadata,
          } as UIMessagePart;
        }

        if (subtype === "task_progress") {
          const taskMsg = msg as {
            task_id: string;
            description: string;
            usage?: { tool_uses?: number; duration_ms?: number };
            last_tool_name?: string;
          };
          log("convert:   task_progress id=%s tools=%d", taskMsg.task_id, taskMsg.usage?.tool_uses);
          yield {
            type: "data-task-progress",
            data: {
              taskId: taskMsg.task_id,
              description: taskMsg.description,
              toolUses: taskMsg.usage?.tool_uses ?? 0,
              durationMs: taskMsg.usage?.duration_ms ?? 0,
              lastToolName: taskMsg.last_tool_name,
            },
            providerMetadata,
          } as UIMessagePart;
        }

        if (subtype === "task_notification") {
          const taskMsg = msg as {
            task_id: string;
            status: string;
            summary: string;
          };
          log("convert:   task_notification id=%s status=%s", taskMsg.task_id, taskMsg.status);
          yield {
            type: "data-task-notification",
            data: {
              taskId: taskMsg.task_id,
              status: taskMsg.status,
              summary: taskMsg.summary,
            },
            providerMetadata,
          } as UIMessagePart;
        }

        if (subtype === "init") {
          const initMsg = msg as {
            model: string;
            tools?: string[];
            slash_commands?: string[];
            cwd: string;
          };
          const commands: SlashCommandInfo[] = (initMsg.slash_commands ?? []).map(
            (name: string) => ({ name }),
          );
          log(
            "convert:   init model=%s tools=%d commands=%d cwd=%s",
            initMsg.model,
            initMsg.tools?.length ?? 0,
            commands.length,
            initMsg.cwd,
          );
          if (commands.length > 0) {
            yield {
              type: "data-available-commands",
              data: { commands },
              providerMetadata,
            } as UIMessagePart;
          }
        }

        if (subtype === "compact_boundary") {
          const compactMsg = msg as {
            compact_metadata?: { trigger?: string; pre_tokens?: number };
          };
          log(
            "convert:   compact_boundary trigger=%s preTokens=%d",
            compactMsg.compact_metadata?.trigger,
            compactMsg.compact_metadata?.pre_tokens,
          );
          yield {
            type: "data-compact-boundary",
            data: {
              trigger: compactMsg.compact_metadata?.trigger ?? "auto",
              preTokens: compactMsg.compact_metadata?.pre_tokens ?? 0,
            },
            providerMetadata,
          } as UIMessagePart;
        }

        if (subtype === "local_command_output") {
          const localMsg = msg as { content?: string };
          log("convert:   local_command_output len=%d", localMsg.content?.length ?? 0);
          yield {
            type: "data-local-command-output",
            data: { content: localMsg.content ?? "" },
            providerMetadata,
          } as UIMessagePart;
        }

        if (subtype === "files_persisted") {
          const filesMsg = msg as {
            files?: Array<{ filename: string; file_id: string }>;
            failed?: Array<{ filename: string; error: string }>;
          };
          log(
            "convert:   files_persisted files=%d failed=%d",
            filesMsg.files?.length ?? 0,
            filesMsg.failed?.length ?? 0,
          );
          yield {
            type: "data-files-persisted",
            data: {
              files: (filesMsg.files ?? []).map((f) => ({
                filename: f.filename,
                fileId: f.file_id,
              })),
              failed: (filesMsg.failed ?? []).map((f) => ({
                filename: f.filename,
                error: f.error,
              })),
            },
            providerMetadata,
          } as UIMessagePart;
        }
        break;
      }

      case "rate_limit_event": {
        const rateLimitMsg = msg as {
          rate_limit_info?: {
            status?: string;
            resetsAt?: number;
            rateLimitType?: string;
            utilization?: number;
          };
        };
        const info = rateLimitMsg.rate_limit_info;
        log("convert: rate_limit_event status=%s type=%s", info?.status, info?.rateLimitType);
        yield {
          type: "data-rate-limit",
          data: {
            rateLimitInfo: {
              status: info?.status ?? "allowed",
              resetsAt: info?.resetsAt,
              rateLimitType: info?.rateLimitType,
              utilization: info?.utilization,
            },
          },
          providerMetadata,
        } as UIMessagePart;
        break;
      }

      case "prompt_suggestion": {
        const suggestionMsg = msg as { suggestion?: string };
        log("convert: prompt_suggestion len=%d", suggestionMsg.suggestion?.length ?? 0);
        yield {
          type: "data-prompt-suggestion",
          data: { suggestion: suggestionMsg.suggestion },
          providerMetadata,
        } as UIMessagePart;
        break;
      }

      default: {
        log("convert: UNHANDLED sdk msg type=%s sessionId=%s", msg.type, sessionId);
        break;
      }
    }
  }
}
