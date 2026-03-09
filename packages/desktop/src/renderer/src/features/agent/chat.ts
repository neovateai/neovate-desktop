import { consumeEventIterator } from "@orpc/client";
import type { ChatInit } from "ai";
import { AbstractChat } from "ai";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type {
  ClaudeCodeUIDispatch,
  ClaudeCodeUIEvent,
  ClaudeCodeUIEventMessage,
  ClaudeCodeUIMessage,
} from "../../../../shared/claude-code/types";
import { ClaudeCodeChatState, ClaudeCodeChatStoreState } from "./chat-state";
import type { ClaudeCodeChatTransport } from "./chat-transport";
import { StoreApi } from "zustand";

export interface ClaudeCodeChatInit extends Omit<ChatInit<ClaudeCodeUIMessage>, "transport"> {
  id: string;
  transport: ClaudeCodeChatTransport;
}

export class ClaudeCodeChat extends AbstractChat<ClaudeCodeUIMessage> {
  readonly store: StoreApi<ClaudeCodeChatStoreState>;
  readonly #transport: ClaudeCodeChatTransport;

  #unsubscribe?: () => Promise<void>;

  constructor({ id, messages, transport, ...init }: ClaudeCodeChatInit) {
    const state = new ClaudeCodeChatState(messages);
    super({
      id,
      transport,
      state,
      ...init,
    });

    this.store = state.store;
    this.#transport = transport;
    this.#unsubscribe = consumeEventIterator(transport.subscribe({ chatId: id }), {
      onEvent: (event) => this.#handleMessage(event),
      onError: (error) => {
        this.store.setState({ eventError: error });
      },
    });
  }

  #handleMessage(message: ClaudeCodeUIEvent) {
    if (message.kind === "request") {
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
    if (event.type === "result" && event.is_error) {
      // this.stateStore.store.setState({
      //   eventError: new Error(event.errors.join("\n") || event.subtype),
      // });
    }
  }

  respondToRequest = async (
    requestId: string,
    respond: { type: "permission_request"; result: PermissionResult },
  ) => {
    if (respond.type === "permission_request") {
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

      if (result.kind === "respond" && result.ok) {
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
    await this.dispatch({ kind: "interrupt" });
    await this.stop();
  };

  dispose = async () => {
    await this.#unsubscribe?.();
  };
}
