/**
 * Thin wrapper around processUIMessageChunk from our local copy of
 * AI SDK's processUIMessageStream.
 *
 * Manages StreamingUIMessageState and flushes updates to Zustand store
 * via ChunkProcessorState.pushMessage() / replaceMessage().
 */
import type { UIMessage, UIMessageChunk } from "ai";

import {
  createStreamingUIMessageState,
  processUIMessageChunk,
  type StreamingUIMessageState,
} from "./process-ui-message-stream";

// ── State interface ─────────────────────────────────────────────────────────

export interface ChunkProcessorState<M extends UIMessage> {
  messages: M[];
  pushMessage(msg: M): void;
  replaceMessage(index: number, msg: M): void;
  error: Error | undefined;
  status: string;
}

// ── ChunkProcessor ──────────────────────────────────────────────────────────

export class ChunkProcessor<M extends UIMessage> {
  private sdkState: StreamingUIMessageState<M>;
  private messageIndex = -1;

  constructor(private state: ChunkProcessorState<M>) {
    this.sdkState = createStreamingUIMessageState<M>({
      lastMessage: undefined,
      messageId: "",
    });
  }

  resetTurn() {
    this.sdkState = createStreamingUIMessageState<M>({
      lastMessage: undefined,
      messageId: "",
    });
    this.messageIndex = -1;
  }

  async processChunk(chunk: UIMessageChunk) {
    await processUIMessageChunk<M>({
      chunk,
      state: this.sdkState,
      write: () => {
        if (this.messageIndex < 0) {
          // First write — push message into state
          this.state.pushMessage(this.sdkState.message);
          this.messageIndex = this.state.messages.length - 1;
        } else {
          this.state.replaceMessage(this.messageIndex, this.sdkState.message);
        }
      },
      onError: (error) => {
        this.state.error = error instanceof Error ? error : new Error(String(error));
        this.state.status = "error";
      },
    });
  }
}
