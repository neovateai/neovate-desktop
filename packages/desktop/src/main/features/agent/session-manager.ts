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
  PermissionMode as SDKPermissionMode,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import debug from "debug";
import type {
  StreamEvent,
  SessionInfo,
  SlashCommandInfo,
  ImageAttachment,
  AgentInfo,
  ModelInfo,
  AccountInfo,
  FastModeState,
  PermissionMode,
  RewindFilesResult,
  McpServerConfig,
  McpServerStatus,
  McpSetServersResult,
} from "../../../shared/features/agent/types";
import { getShellEnvironment } from "./shell-env";
import { EventPublisher } from "@orpc/server";
import { readModelFromSettings } from "./claude-settings";
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

    log("buildOptions: model=%s permissionMode=default", model ?? "(default)");

    return {
      ...(model ? { model } : {}),
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
  ): Promise<{
    sessionId: string;
    currentModel?: string;
    commands?: SlashCommandInfo[];
    agents?: AgentInfo[];
    models?: ModelInfo[];
    account?: AccountInfo;
    outputStyle?: string;
    availableOutputStyles?: string[];
    fastModeState?: FastModeState;
  }> {
    const t0 = performance.now();
    log("createSession: START cwd=%s model=%s activeSessions=%d", cwd, model, this.sessions.size);

    const sessionId = randomUUID();
    const options = await this.buildOptions(cwd, model);
    log("createSession: options built in %dms", Math.round(performance.now() - t0));
    const input = new Pushable<SDKUserMessage>();
    const q = query({ prompt: input, options: { ...options, sessionId } });

    this.sessions.set(sessionId, { query: q, input, cwd });
    log("createSession: query created, awaiting init");

    const initResult = await q.initializationResult();
    log(
      "createSession: init received — commands=%d agents=%d models=%d model=%s",
      initResult.commands?.length ?? 0,
      initResult.agents?.length ?? 0,
      initResult.models?.length ?? 0,
      options.model,
    );

    const commands: SlashCommandInfo[] = (initResult.commands ?? []).map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      argumentHint: cmd.argumentHint,
    }));

    const agents: AgentInfo[] = (initResult.agents ?? []).map((a) => ({
      name: a.name,
      description: a.description,
      ...(a.model ? { model: a.model } : {}),
    }));

    const models: ModelInfo[] = (initResult.models ?? []).map((m) => ({
      value: m.value,
      displayName: m.displayName,
      description: m.description,
      ...(m.supportsEffort != null ? { supportsEffort: m.supportsEffort } : {}),
      ...(m.supportedEffortLevels ? { supportedEffortLevels: m.supportedEffortLevels } : {}),
    }));

    // Resolve effective model: explicit param > settings chain
    const currentModel = model ?? readModelFromSettings(sessionId, cwd);

    log(
      "createSession: DONE in %dms sessionId=%s commands=%d agents=%d models=%d currentModel=%s activeSessions=%d",
      Math.round(performance.now() - t0),
      sessionId,
      commands.length,
      agents.length,
      models.length,
      currentModel ?? "(default)",
      this.sessions.size,
    );

    return {
      sessionId,
      currentModel,
      commands: commands.length > 0 ? commands : undefined,
      agents: agents.length > 0 ? agents : undefined,
      models: models.length > 0 ? models : undefined,
      account: initResult.account,
      outputStyle: initResult.output_style,
      availableOutputStyles: initResult.available_output_styles,
      fastModeState: initResult.fast_mode_state,
    };
  }

  async *prompt(
    sessionId: string,
    text: string,
    emitter: (event: StreamEvent) => void,
    attachments?: ImageAttachment[],
  ): AsyncGenerator<StreamEvent> {
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

    // Set permission emitter so canUseTool can forward events
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
  ): AsyncGenerator<StreamEvent> {
    const t0 = performance.now();
    log("loadSession: START sessionId=%s cwd=%s", sessionId, cwd);

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
        description: cmd.description,
        argumentHint: cmd.argumentHint,
      }));
      if (commands.length > 0) {
        eventCount++;
        yield { type: "available_commands", sessionId, commands };
      }

      // Emit available models and resolved current model
      const models: ModelInfo[] = (initResult.models ?? []).map((m) => ({
        value: m.value,
        displayName: m.displayName,
        description: m.description,
        ...(m.supportsEffort != null ? { supportsEffort: m.supportsEffort } : {}),
        ...(m.supportedEffortLevels ? { supportedEffortLevels: m.supportedEffortLevels } : {}),
      }));
      if (models.length > 0) {
        eventCount++;
        yield { type: "available_models", sessionId, models };
      }
      const currentModel = readModelFromSettings(sessionId, resolvedCwd);
      if (currentModel) {
        eventCount++;
        yield { type: "current_model", sessionId, model: currentModel };
      }

      // Replay history from persisted messages
      const messages = await getSessionMessages(sessionId);
      log("loadSession: replaying %d historical messages", messages.length);

      for (const msg of messages) {
        for (const event of this.convertReplayMessage(sessionId, msg)) {
          eventCount++;
          yield event;
        }
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

  private getQuery(sessionId: string): Query {
    const managed = this.sessions.get(sessionId);
    if (!managed) throw new Error(`Unknown session: ${sessionId}`);
    return managed.query;
  }

  async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void> {
    log("setPermissionMode: sessionId=%s mode=%s", sessionId, mode);
    await this.getQuery(sessionId).setPermissionMode(mode as SDKPermissionMode);
  }

  async setModel(sessionId: string, model?: string): Promise<void> {
    log("setModel: sessionId=%s model=%s", sessionId, model);
    await this.getQuery(sessionId).setModel(model);
  }

  async setMaxThinkingTokens(sessionId: string, maxThinkingTokens: number | null): Promise<void> {
    log("setMaxThinkingTokens: sessionId=%s maxThinkingTokens=%s", sessionId, maxThinkingTokens);
    await this.getQuery(sessionId).setMaxThinkingTokens(maxThinkingTokens);
  }

  async stopTask(sessionId: string, taskId: string): Promise<void> {
    log("stopTask: sessionId=%s taskId=%s", sessionId, taskId);
    await this.getQuery(sessionId).stopTask(taskId);
  }

  async rewindFiles(
    sessionId: string,
    userMessageId: string,
    options?: { dryRun?: boolean },
  ): Promise<RewindFilesResult> {
    log(
      "rewindFiles: sessionId=%s userMessageId=%s dryRun=%s",
      sessionId,
      userMessageId,
      options?.dryRun,
    );
    return await this.getQuery(sessionId).rewindFiles(userMessageId, options);
  }

  async mcpServerStatus(sessionId: string): Promise<McpServerStatus[]> {
    log("mcpServerStatus: sessionId=%s", sessionId);
    return await this.getQuery(sessionId).mcpServerStatus();
  }

  async reconnectMcpServer(sessionId: string, serverName: string): Promise<void> {
    log("reconnectMcpServer: sessionId=%s serverName=%s", sessionId, serverName);
    await this.getQuery(sessionId).reconnectMcpServer(serverName);
  }

  async toggleMcpServer(sessionId: string, serverName: string, enabled: boolean): Promise<void> {
    log("toggleMcpServer: sessionId=%s serverName=%s enabled=%s", sessionId, serverName, enabled);
    await this.getQuery(sessionId).toggleMcpServer(serverName, enabled);
  }

  async setMcpServers(
    sessionId: string,
    servers: Record<string, McpServerConfig>,
  ): Promise<McpSetServersResult> {
    log("setMcpServers: sessionId=%s serverCount=%d", sessionId, Object.keys(servers).length);
    return await this.getQuery(sessionId).setMcpServers(servers);
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
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      log("closeSession: no-op, unknown sessionId=%s", sessionId);
      return;
    }
    managed.query.close();
    const v2 = this.sessionsV2.get(sessionId);
    if (v2) {
      for (const [, pending] of v2.pendingRequests) {
        clearTimeout(pending.timer);
        pending.resolve({ behavior: "deny", message: "Session closed" });
      }
      this.sessionsV2.delete(sessionId);
    }
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
      }
      if (text || images) {
        log(
          "convertReplay: user_message len=%d images=%d uuid=%s",
          text.length,
          images?.length ?? 0,
          msg.uuid,
        );
        yield { type: "user_message", sessionId, text, ...(images ? { images } : {}) };
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
              input: block.input,
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
              input: block.input,
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
        let images: Array<{ mediaType: string; base64: string }> | undefined;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b) => b.type === "text")
            .map((b) => (b as { text: string }).text)
            .join("");
          const imageBlocks = content.filter((b) => b.type === "image");
          if (imageBlocks.length > 0) {
            images = imageBlocks.map((b: any) => ({
              mediaType: b.source?.media_type ?? "image/png",
              base64: b.source?.data ?? "",
            }));
          }
        }
        const isReplay = "isReplay" in msg && msg.isReplay;
        log(
          "convert: user_message len=%d images=%d replay=%s uuid=%s",
          text.length,
          images?.length ?? 0,
          isReplay,
          msg.uuid ?? "-",
        );
        if (text || images) {
          yield { type: "user_message", sessionId, text, ...(images ? { images } : {}) };
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
        yield {
          type: "result",
          sessionId,
          stopReason,
          costUsd: msg.total_cost_usd,
          durationMs: msg.duration_ms,
          inputTokens: msg.usage?.input_tokens,
          outputTokens: msg.usage?.output_tokens,
        };
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
          if (msg.subtype === "task_started") {
            const taskMsg = msg as Extract<SDKMessage, { type: "system"; subtype: "task_started" }>;
            log("convert:   task_started id=%s desc=%s", taskMsg.task_id, taskMsg.description);
            yield {
              type: "task_started",
              sessionId,
              taskId: taskMsg.task_id,
              description: taskMsg.description,
              taskType: taskMsg.task_type,
            };
          }
          if (msg.subtype === "task_progress") {
            const taskMsg = msg as Extract<
              SDKMessage,
              { type: "system"; subtype: "task_progress" }
            >;
            log(
              "convert:   task_progress id=%s tools=%d",
              taskMsg.task_id,
              taskMsg.usage?.tool_uses,
            );
            yield {
              type: "task_progress",
              sessionId,
              taskId: taskMsg.task_id,
              description: taskMsg.description,
              toolUses: taskMsg.usage?.tool_uses ?? 0,
              durationMs: taskMsg.usage?.duration_ms ?? 0,
              lastToolName: taskMsg.last_tool_name,
            };
          }
          if (msg.subtype === "task_notification") {
            const taskMsg = msg as Extract<
              SDKMessage,
              { type: "system"; subtype: "task_notification" }
            >;
            log("convert:   task_notification id=%s status=%s", taskMsg.task_id, taskMsg.status);
            yield {
              type: "task_notification",
              sessionId,
              taskId: taskMsg.task_id,
              status: taskMsg.status,
              summary: taskMsg.summary,
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

  // ─── V2 API ───────────────────────────────────────────────────────────────────

  // V2: single global publisher — sessionId is the channel key
  readonly eventPublisher = new EventPublisher<Record<string, ClaudeCodeUIEvent>>();
  // V2: per-session pending permission requests
  private sessionsV2 = new Map<
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
        const session = this.sessionsV2.get(sessionId);
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

  /** V2: start a new session. */
  async createSessionV2(
    cwd: string,
    model?: string,
  ): Promise<{ sessionId: string } & Awaited<ReturnType<Query["initializationResult"]>>> {
    const sessionId = randomUUID();
    const initResult = await this.initSessionV2(sessionId, cwd, { model });
    return { ...initResult, sessionId };
  }

  /** V2: resume an existing session, returning converted historical messages. */
  async loadSessionV2(
    sessionId: string,
    cwd: string,
  ): Promise<{
    sessionId: string;
    capabilities: Awaited<ReturnType<Query["initializationResult"]>>;
    messages: ClaudeCodeUIMessage[];
  }> {
    const capabilities = await this.initSessionV2(sessionId, cwd, { resume: sessionId });

    const sessionMessages = await getSessionMessages(sessionId);
    const messages = await this.toUIMessages(sessionMessages);

    log(
      "loadSessionV2: sessionId=%s raw=%d messages=%d",
      sessionId,
      sessionMessages.length,
      messages.length,
    );

    return { sessionId, capabilities, messages };
  }

  /** Shared V2 session initialization: shell env, query, canUseTool wiring. */
  private async initSessionV2(
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
    this.sessionsV2.set(sessionId, { input, query: q, cwd, pendingRequests });

    return q.initializationResult();
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
   * V2: stream a user message as UIMessageChunks.
   * Events from the SDK are routed to the event publisher.
   */
  async *stream(
    sessionId: string,
    message: import("../../../shared/claude-code/types").ClaudeCodeUIMessage,
  ): AsyncGenerator<import("../../../shared/claude-code/types").ClaudeCodeUIMessageChunk> {
    const session = this.sessionsV2.get(sessionId);
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

  /** V2: handle dispatch — respond to permission request or configure session */
  handleDispatch(sessionId: string, dispatch: ClaudeCodeUIDispatch): ClaudeCodeUIDispatchResult {
    if (dispatch.kind === "respond") {
      const session = this.sessionsV2.get(sessionId);
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
    const session = this.sessionsV2.get(sessionId);
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
