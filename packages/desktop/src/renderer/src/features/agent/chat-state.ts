import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatState, ChatStatus } from "ai";

import { createStore, type StoreApi } from "zustand/vanilla";

import type {
  ClaudeCodeUIEventRequest,
  ClaudeCodeUIMessage,
} from "../../../../shared/claude-code/types";
import type { PermissionMode } from "../../../../shared/features/agent/types";

export type ClaudeCodeChatCapabilities = Awaited<ReturnType<Query["initializationResult"]>>;

export interface PendingContextClear {
  plan: string;
  mode: PermissionMode;
  cwd?: string;
}

export interface ClaudeCodeChatStoreState {
  messages: ClaudeCodeUIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  eventError: Error | undefined;
  pendingRequests: Array<{
    requestId: string;
    request: ClaudeCodeUIEventRequest;
  }>;
  capabilities: ClaudeCodeChatCapabilities | null;
  pendingContextClear?: PendingContextClear;
}

export class ClaudeCodeChatState implements ChatState<ClaudeCodeUIMessage> {
  readonly store: StoreApi<ClaudeCodeChatStoreState>;

  constructor(initialMessages: ClaudeCodeUIMessage[] = []) {
    this.store = createStore<ClaudeCodeChatStoreState>()(() => ({
      messages: initialMessages,
      status: "ready",
      error: undefined,
      eventError: undefined,
      pendingRequests: [],
      capabilities: null,
    }));
  }

  get messages() {
    return this.store.getState().messages;
  }

  set messages(messages: ClaudeCodeUIMessage[]) {
    this.store.setState({ messages });
  }

  get status() {
    return this.store.getState().status;
  }

  set status(status: ChatStatus) {
    this.store.setState({ status });
  }

  get error() {
    return this.store.getState().error;
  }

  set error(error: Error | undefined) {
    this.store.setState({ error });
  }

  pushMessage = (message: ClaudeCodeUIMessage) => {
    this.store.setState((state) => ({ messages: state.messages.concat(this.snapshot(message)) }));
  };

  popMessage = () => {
    this.store.setState((state) => ({ messages: state.messages.slice(0, -1) }));
  };

  replaceMessage = (index: number, message: ClaudeCodeUIMessage) => {
    this.store.setState((state) => ({
      messages: [
        ...state.messages.slice(0, index),
        this.snapshot(message),
        ...state.messages.slice(index + 1),
      ],
    }));
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}
