import { consumeEventIterator } from "@orpc/client";
import type { ChatInit } from "ai";
import { AbstractChat } from "ai";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type {
  ClaudeCodeUIEvent,
  ClaudeCodeUIEventMessage,
  ClaudeCodeUIMessage,
} from "../../../../shared/features/agent/chat-types";
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
      console.log(
        "[handleMessage] START requestId=%s request=%o",
        message.requestId,
        JSON.stringify(message.request),
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
    console.log("[respondToRequest] START requestId=%s respond=%o", requestId, respond);

    if (respond.type === "permission_request") {
      const request = this.store
        .getState()
        .pendingRequests.find((request) => request.requestId === requestId);

      const result = await this.#transport.dispatch({
        chatId: this.id,
        dispatch: {
          kind: "respond",
          requestId,
          respond: {
            type: "permission_request",
            result: { ...respond.result, toolUseID: request?.request.options.toolUseID },
          },
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

  dispose = async () => {
    await this.#unsubscribe?.();
  };
}
