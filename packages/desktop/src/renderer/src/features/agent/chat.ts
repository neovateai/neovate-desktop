import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ChatInit } from "ai";

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
    log("init: sessionId=%s messages=%d", id, messages?.length ?? 0);
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

    if (onTurnComplete || onTurnStart) {
      let prev = this.store.getState().status;
      this.#unsubscribeStore = this.store.subscribe((cur) => {
        const status = cur.status;
        if (status === prev) return;

        if (status === "submitted" || status === "streaming") {
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

  #handleMessage(message: ClaudeCodeUIEvent) {
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
    }
  }

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
