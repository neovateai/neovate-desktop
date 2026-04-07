import debug from "debug";
import { randomUUID } from "node:crypto";

import type {
  ClaudeCodeUIEvent,
  ClaudeCodeUIEventMessage,
} from "../../../shared/claude-code/types";
import type {
  ConversationRef,
  InboundMessage,
  InlineAction,
} from "../../../shared/features/remote-control/types";
import type { SessionManager } from "../agent/session-manager";
import type { LinkStore } from "./link-store";
import type { RemoteControlPlatformAdapter } from "./platforms/types";

import { OutputBatcherPool } from "./output-batcher";

const log = debug("neovate:remote-control:bridge");

const TYPING_INTERVAL_MS = 5000;

export class SessionBridge {
  private batcherPool = new OutputBatcherPool();
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private sessionManager: SessionManager,
    private linkStore: LinkStore,
  ) {}

  /** Subscribe to session events for a linked conversation via async iteration. */
  subscribeSession(
    sessionId: string,
    ref: ConversationRef,
    adapter: RemoteControlPlatformAdapter,
  ): void {
    // Cancel existing subscription if re-linking
    this.unsubscribeSession(sessionId);

    const ac = new AbortController();
    this.abortControllers.set(sessionId, ac);

    // Fire-and-forget the async iteration loop
    void (async () => {
      try {
        for await (const event of this.sessionManager.eventPublisher.subscribe(sessionId, {
          signal: ac.signal,
        })) {
          void this.onSessionEvent(sessionId, ref, adapter, event);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          log("subscription loop error for session %s: %O", sessionId, err);
        }
      }
    })();

    log("subscribed to session %s", sessionId);
  }

  /** Unsubscribe from session events. */
  unsubscribeSession(sessionId: string): void {
    const ac = this.abortControllers.get(sessionId);
    if (ac) {
      ac.abort();
      this.abortControllers.delete(sessionId);
    }
    this.stopTyping(sessionId);

    const ref = this.linkStore.getRef(sessionId);
    if (ref) {
      this.batcherPool.dispose(ref);
    }
  }

  /** Send a user message from a messaging platform into a session. */
  async sendToSession(sessionId: string, msg: InboundMessage): Promise<void> {
    const uiMessage = {
      id: randomUUID(),
      role: "user" as const,
      parts: [{ type: "text" as const, text: msg.text }],
      createdAt: new Date(),
    };

    await this.sessionManager.send(sessionId, uiMessage);
    log("sent message to session %s", sessionId);
  }

  /** Handle a permission response from messaging (approve/deny button). */
  async respondToPermission(sessionId: string, requestId: string, allow: boolean): Promise<void> {
    await this.sessionManager.handleDispatch(sessionId, {
      kind: "respond",
      requestId,
      respond: {
        type: "permission_request",
        result: allow
          ? { behavior: "allow" as const }
          : { behavior: "deny" as const, message: "Denied via remote control" },
      },
    });
    log("responded to permission %s: %s", requestId, allow ? "allow" : "deny");
  }

  /** Interrupt the current turn. */
  interruptSession(sessionId: string): void {
    void this.sessionManager.handleDispatch(sessionId, { kind: "interrupt" });
    log("interrupted session %s", sessionId);
  }

  /** Clean up all subscriptions and batchers. */
  dispose(): void {
    log("disposing all subscriptions (%d active)", this.abortControllers.size);
    for (const sessionId of this.abortControllers.keys()) {
      this.unsubscribeSession(sessionId);
    }
    this.batcherPool.disposeAll();
  }

  private async onSessionEvent(
    sessionId: string,
    ref: ConversationRef,
    adapter: RemoteControlPlatformAdapter,
    event: ClaudeCodeUIEvent,
  ): Promise<void> {
    try {
      log("session %s event: kind=%s", sessionId, event.kind);
      if (event.kind === "chunk") {
        this.handleChunk(sessionId, ref, adapter, event);
      } else if (event.kind === "event") {
        await this.handleEvent(sessionId, ref, adapter, event.event);
      } else if (event.kind === "request") {
        await this.handleRequest(ref, adapter, event);
      }
    } catch (err) {
      log("error handling session event: %O", err);
    }
  }

  private handleChunk(
    sessionId: string,
    ref: ConversationRef,
    adapter: RemoteControlPlatformAdapter,
    event: Extract<ClaudeCodeUIEvent, { kind: "chunk" }>,
  ): void {
    const chunk = event.chunk;
    log("session %s chunk: type=%s", sessionId, chunk.type);

    // Only handle assistant text deltas
    if (chunk.type !== "text-delta") return;

    this.startTyping(sessionId, ref, adapter);
    const batcher = this.batcherPool.getOrCreate(ref, adapter);
    batcher.append((chunk as any).delta ?? "");
  }

  private async handleEvent(
    sessionId: string,
    ref: ConversationRef,
    adapter: RemoteControlPlatformAdapter,
    event: ClaudeCodeUIEventMessage,
  ): Promise<void> {
    const eventType = event.type;

    // Result events signal turn completion
    if (eventType === "result") {
      const subtype = (event as any).subtype;
      log("session %s turn complete (subtype=%s)", sessionId, subtype ?? "success");
      const batcher = this.batcherPool.getOrCreate(ref, adapter);
      batcher.onTurnComplete();
      this.stopTyping(sessionId);

      if (subtype === "error") {
        const errMsg = (event as any).error ?? "Unknown error";
        await adapter.sendMessage({ ref, text: `Error: ${errMsg}` });
      }
      return;
    }

    // Tool progress — short status lines
    if (eventType === "tool_progress" || eventType === "tool_use_summary") {
      const text = formatToolProgress(event);
      if (text) {
        log("session %s tool event: %s", sessionId, text);
        await adapter.sendMessage({ ref, text });
      }
    }
  }

  private async handleRequest(
    ref: ConversationRef,
    adapter: RemoteControlPlatformAdapter,
    event: Extract<ClaudeCodeUIEvent, { kind: "request" }>,
  ): Promise<void> {
    const { requestId, request } = event;

    if (request.type === "permission_request") {
      const toolName = request.toolName;
      const input = request.input;
      const summary = formatToolSummary(toolName, input);
      log("permission request: %s (requestId=%s)", summary, requestId);

      const actions: InlineAction[] = [
        { label: "Approve", callbackData: `perm:approve:${requestId}` },
        { label: "Deny", callbackData: `perm:deny:${requestId}` },
      ];

      await adapter.sendMessage({
        ref,
        text: `Permission requested: ${summary}`,
        inlineActions: actions,
      });
    }
  }

  private startTyping(
    sessionId: string,
    ref: ConversationRef,
    adapter: RemoteControlPlatformAdapter,
  ): void {
    if (this.typingIntervals.has(sessionId)) return;

    void adapter.sendTypingIndicator(ref).catch(() => {});
    const interval = setInterval(() => {
      void adapter.sendTypingIndicator(ref).catch(() => {});
    }, TYPING_INTERVAL_MS);
    this.typingIntervals.set(sessionId, interval);
  }

  private stopTyping(sessionId: string): void {
    const interval = this.typingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(sessionId);
    }
  }
}

function formatToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "bash":
    case "Bash":
      return `Run: \`${truncate(String(input.command ?? ""), 80)}\``;
    case "edit":
    case "Edit":
      return `Edit: \`${input.file_path ?? "file"}\``;
    case "write":
    case "Write":
      return `Write: \`${input.file_path ?? "file"}\``;
    default:
      return `${toolName}`;
  }
}

function formatToolProgress(event: ClaudeCodeUIEventMessage): string | null {
  const content = (event as any).content ?? (event as any).message;
  if (typeof content === "string") return content;
  return null;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + "...";
}
