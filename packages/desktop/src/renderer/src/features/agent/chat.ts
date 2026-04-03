import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ChatInit, ChatRequestOptions, FileUIPart } from "ai";

import { consumeEventIterator } from "@orpc/client";
import { AbstractChat } from "ai";
import debug from "debug";
import { StoreApi } from "zustand";

const log = debug("neovate:agent-chat:core");

import type {
  ClaudeCodeUIDispatch,
  ClaudeCodeUIEvent,
  ClaudeCodeUIEventMessage,
  ClaudeCodeUIMessage,
  ContextUsageEvent,
} from "../../../../shared/claude-code/types";
import type { ClaudeCodeChatTransport } from "./chat-transport";

import { ClaudeCodeChatState, ClaudeCodeChatStoreState } from "./chat-state";
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
} from "./process-ui-message-stream";
import { useAgentStore } from "./store";

export interface ClaudeCodeChatInit extends Omit<ChatInit<ClaudeCodeUIMessage>, "transport"> {
  id: string;
  transport: ClaudeCodeChatTransport;
  onTurnComplete?: (sessionId: string, result: "success" | "error") => void;
  onTurnStart?: (sessionId: string) => void;
}

export class ClaudeCodeChat extends AbstractChat<ClaudeCodeUIMessage> {
  readonly store: StoreApi<ClaudeCodeChatStoreState>;
  readonly #transport: ClaudeCodeChatTransport;
  readonly #state: ClaudeCodeChatState;
  #streamingState: StreamingUIMessageState<ClaudeCodeUIMessage> | null = null;
  #messageIndex = -1;

  #unsubscribe?: () => Promise<void>;
  #unsubscribeStore?: () => void;

  constructor({
    id,
    messages,
    transport,
    onTurnComplete,
    onTurnStart,
    ...init
  }: ClaudeCodeChatInit) {
    const state = new ClaudeCodeChatState(messages);
    super({
      id,
      transport,
      state,
      ...init,
    });

    this.store = state.store;
    this.#transport = transport;
    this.#state = state;

    log("init: sessionId=%s messages=%d", id, messages?.length ?? 0);

    // ── Reassign sendMessage (arrow property on AbstractChat) ──────────
    // AbstractChat assigns sendMessage as an arrow function in its constructor,
    // so we must reassign after super() — prototype overrides would be shadowed.
    type SendMessageInput = {
      text?: string;
      files?: FileList | FileUIPart[];
      metadata?: ClaudeCodeUIMessage["metadata"];
      messageId?: string;
    };

    this.sendMessage = async (message?: SendMessageInput, _options?: ChatRequestOptions) => {
      const text = message?.text ?? "";
      const metadata = message?.metadata ?? { sessionId: id, parentToolUseId: null };
      const fileParts = message?.files ?? [];

      const userMessage: ClaudeCodeUIMessage = {
        id: this.generateId(),
        role: "user",
        parts: [...(text ? [{ type: "text" as const, text }] : []), ...fileParts],
        metadata,
      } as ClaudeCodeUIMessage;

      log("sendMessage: sessionId=%s textLen=%d", id, text.length);

      // Push through ChatState interface (triggers timing logic)
      this.#state.pushMessage(userMessage);
      this.#state.status = "submitted";

      // Fire and forget — subscribe handles the rest
      try {
        await this.#transport.send(id, userMessage);
      } catch (err: unknown) {
        // Send failed → rollback: remove optimistically added user message, restore status
        const errMsg = err instanceof Error ? err.message : String(err);
        log("sendMessage: FAILED sessionId=%s error=%s", id, errMsg);
        this.#state.popMessage();
        this.#state.status = "ready";
        this.#state.error = err instanceof Error ? err : new Error(String(err));
      }
    };

    // ── Reassign stop (arrow property on AbstractChat) ────────────────
    this.stop = async () => {
      log("stop: sessionId=%s", id);
      await this.dispatch({ kind: "interrupt" });
      this.store.setState({ pendingRequests: [] });
    };

    // ── Subscribe to events (single long-lived connection) ────────────
    this.#unsubscribe = consumeEventIterator(transport.subscribe({ chatId: id }), {
      onEvent: (event) => this.#handleMessage(event),
      onError: (error) => {
        log(
          "subscribe error: sessionId=%s error=%s",
          id,
          error instanceof Error ? error.message : String(error),
        );
        this.store.setState({ eventError: error });
      },
    });

    // ── Status change callbacks ───────────────────────────────────────
    if (onTurnComplete || onTurnStart) {
      let prev = this.store.getState().status;
      this.#unsubscribeStore = this.store.subscribe((cur) => {
        const status = cur.status;
        if (status === prev) return;

        if (status === "submitted" || status === "streaming") {
          if (cur.promptSuggestion !== null) {
            this.store.setState({ promptSuggestion: null });
          }
          onTurnStart?.(id);
        } else if (
          (prev === "streaming" && (status === "ready" || status === "error")) ||
          (prev === "submitted" && status === "error")
        ) {
          onTurnComplete?.(id, status === "ready" ? "success" : "error");
        }

        prev = status;
      });
    }
  }

  // ── Event handling (subscribe channel) ──────────────────────────────

  async #handleMessage(message: ClaudeCodeUIEvent) {
    if (message.kind === "request_settled") {
      this.store.setState((state) => ({
        pendingRequests: state.pendingRequests.filter((r) => r.requestId !== message.requestId),
      }));
      return;
    }

    if (message.kind === "request") {
      log(
        "permission request: sessionId=%s requestId=%s toolName=%s",
        this.id,
        message.requestId,
        message.request.toolName,
      );
      this.store.setState((state) => ({
        pendingRequests: state.pendingRequests.some((item) => item.requestId === message.requestId)
          ? state.pendingRequests
          : state.pendingRequests.concat({
              requestId: message.requestId,
              request: message.request,
            }),
      }));
      return;
    }

    if (message.kind === "chunk") {
      // Turn boundaries driven by SDKMessageTransformer native chunks:
      // "start" chunk (emitted on system/init) → streaming
      // "finish" chunk (emitted on result) → ready
      if (message.chunk.type === "start") {
        // Create streaming state per turn — matches AI SDK's AbstractChat.makeRequest()
        this.#streamingState = createStreamingUIMessageState<ClaudeCodeUIMessage>({
          lastMessage: undefined,
          messageId: this.generateId(),
        });
        this.#messageIndex = -1;
        this.#state.status = "streaming";
      }
      if (this.#streamingState) {
        await processUIMessageStream<ClaudeCodeUIMessage>({
          chunk: message.chunk,
          state: this.#streamingState,
          write: () => {
            if (this.#messageIndex < 0) {
              this.#state.pushMessage(this.#streamingState!.message);
              this.#messageIndex = this.#state.messages.length - 1;
            } else {
              this.#state.replaceMessage(this.#messageIndex, this.#streamingState!.message);
            }
          },
          onError: (error) => {
            this.#state.error = error instanceof Error ? error : new Error(String(error));
            this.#state.status = "error";
          },
        });
      }
      if (message.chunk.type === "finish") {
        this.#streamingState = null;
        this.#state.status = "ready";
      }
      return;
    }

    this.#handleEvent(message.event);
  }

  #handleEvent(event: ClaudeCodeUIEventMessage) {
    if (event.type === "context_usage") {
      const { contextWindowSize, usedTokens, remainingPct } = event as ContextUsageEvent & {
        id: string;
      };
      useAgentStore.getState().setSessionUsage(this.id, {
        contextWindowSize,
        usedTokens,
        remainingPct,
      });
    } else if (event.type === "prompt_suggestion") {
      const suggestion = (event as { suggestion: string }).suggestion;
      log("prompt_suggestion: sessionId=%s suggestion=%s", this.id, suggestion);
      this.store.setState({ promptSuggestion: suggestion });
    }
  }

  // ── Methods unchanged ───────────────────────────────────────────────

  respondToRequest = async (
    requestId: string,
    respond: { type: "permission_request"; result: PermissionResult },
  ) => {
    if (respond.type === "permission_request") {
      log(
        "respondToRequest: sessionId=%s requestId=%s behavior=%s",
        this.id,
        requestId,
        respond.result.behavior,
      );
      const request = this.store
        .getState()
        .pendingRequests.find((request) => request.requestId === requestId);

      const result = await this.dispatch({
        kind: "respond",
        requestId,
        respond: {
          type: "permission_request",
          result: { ...respond.result, toolUseID: request?.request.options.toolUseID },
        },
      });

      if (result.kind === "respond") {
        this.store.setState((state) => ({
          pendingRequests: state.pendingRequests.filter(
            (request) => request.requestId !== requestId,
          ),
        }));
      }
    }
  };

  dispatch = (dispatch: ClaudeCodeUIDispatch) => {
    return this.#transport.dispatch({ chatId: this.id, dispatch });
  };

  interrupt = async () => {
    log(
      "interrupt: sessionId=%s pending=%d",
      this.id,
      this.store.getState().pendingRequests.length,
    );
    await this.dispatch({ kind: "interrupt" });
    // Clear pending permission requests so dialogs don't stay stuck after interrupt
    this.store.setState({ pendingRequests: [] });
    await this.stop();
  };

  dispose = async () => {
    log("dispose: sessionId=%s", this.id);
    this.#unsubscribeStore?.();
    await this.#unsubscribe?.();
  };
}
