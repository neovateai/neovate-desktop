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

  // Prompt suggestion (follow-up)
  promptSuggestion: string | null;

  // Query status timing
  turnStartedAt: number | null;
  thinkingStartedAt: number | null;
  thinkingDuration: number | null;
  lastChunkAt: number | null;
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
      promptSuggestion: null,
      turnStartedAt: null,
      thinkingStartedAt: null,
      thinkingDuration: null,
      lastChunkAt: null,
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
    const prev = this.store.getState().status;
    if ((status === "submitted" || status === "streaming") && prev === "ready") {
      this.store.setState({
        status,
        turnStartedAt: Date.now(),
        thinkingStartedAt: null,
        thinkingDuration: null,
        lastChunkAt: Date.now(),
      });
    } else {
      this.store.setState({ status });
    }
  }

  get error() {
    return this.store.getState().error;
  }

  set error(error: Error | undefined) {
    this.store.setState({ error });
  }

  pushMessage = (message: ClaudeCodeUIMessage) => {
    const now = Date.now();
    const state = this.store.getState();
    const timingUpdate: Partial<ClaudeCodeChatStoreState> = { lastChunkAt: now };

    // If thinking was active when a new message starts, accumulate duration
    if (state.thinkingStartedAt) {
      timingUpdate.thinkingDuration =
        (state.thinkingDuration ?? 0) + (now - state.thinkingStartedAt);
      timingUpdate.thinkingStartedAt = null;
    }

    this.store.setState((s) => ({
      ...timingUpdate,
      messages: s.messages.concat(this.snapshot(message)),
    }));
  };

  popMessage = () => {
    this.store.setState((state) => ({ messages: state.messages.slice(0, -1) }));
  };

  replaceMessage = (index: number, message: ClaudeCodeUIMessage) => {
    const now = Date.now();
    const state = this.store.getState();
    const lastPart = message.parts[message.parts.length - 1];
    const isReasoning = lastPart?.type === "reasoning";

    const timingUpdate: Partial<ClaudeCodeChatStoreState> = {};

    if (isReasoning && !state.thinkingStartedAt) {
      timingUpdate.thinkingStartedAt = now;
    } else if (!isReasoning && state.thinkingStartedAt) {
      timingUpdate.thinkingDuration =
        (state.thinkingDuration ?? 0) + (now - state.thinkingStartedAt);
      timingUpdate.thinkingStartedAt = null;
    }

    if (!isReasoning) {
      timingUpdate.lastChunkAt = now;
    }

    this.store.setState((s) => ({
      ...timingUpdate,
      messages: [
        ...s.messages.slice(0, index),
        this.snapshot(message),
        ...s.messages.slice(index + 1),
      ],
    }));
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}
