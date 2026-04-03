/**
 * Thin wrapper around AI SDK's readUIMessageStream.
 *
 * Instead of duplicating processUIMessageStream logic, we create a
 * ReadableStream<UIMessageChunk>, expose processChunk() to enqueue
 * chunks, and let the AI SDK's own pipeline assemble UIMessages.
 *
 * Zero chunk-processing logic duplicated — all assembly is done by AI SDK.
 */
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

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
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private stream: ReadableStream<UIMessageChunk>;
  private messageIndex = -1;
  private consuming = false;
  private consumePromise: Promise<void> | null = null;

  constructor(private state: ChunkProcessorState<M>) {
    this.stream = this.createStream();
  }

  private createStream(): ReadableStream<UIMessageChunk> {
    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
      },
    });
  }

  resetTurn() {
    // Close previous stream if still open
    if (this.controller) {
      try {
        this.controller.close();
      } catch {
        // already closed
      }
    }
    // Create fresh stream for new turn
    this.stream = this.createStream();
    this.consuming = false;
  }

  async processChunk(chunk: UIMessageChunk) {
    if (!this.controller) return;

    // On first chunk of a turn, start consuming the stream
    if (!this.consuming) {
      this.consuming = true;
      this.startConsuming();
    }

    // Error chunks: readUIMessageStream calls onError but doesn't close the stream.
    // We handle it directly and close.
    if (chunk.type === "error") {
      this.state.error = new Error(chunk.errorText);
      this.state.status = "error";
      try {
        this.controller.close();
      } catch {
        // already closed
      }
      this.controller = null;
      return;
    }

    this.controller.enqueue(chunk);

    // On finish, close the stream and wait for pipeline to drain
    if (chunk.type === "finish") {
      try {
        this.controller.close();
      } catch {
        // already closed
      }
      this.controller = null;
      if (this.consumePromise) {
        await this.consumePromise;
      }
    }
  }

  private startConsuming() {
    const message = {
      id: "",
      metadata: undefined,
      role: "assistant" as const,
      parts: [],
    } as unknown as M;

    // Push the new message into state
    this.state.pushMessage(message);
    this.messageIndex = this.state.messages.length - 1;

    // readUIMessageStream yields the message as it's updated
    const iter = readUIMessageStream<M>({
      message,
      stream: this.stream,
      onError: (error) => {
        this.state.error = error instanceof Error ? error : new Error(String(error));
        this.state.status = "error";
      },
    });

    // Consume async iterator — each yield means the message was updated
    this.consumePromise = (async () => {
      for await (const updatedMessage of iter) {
        if (this.messageIndex >= 0) {
          this.state.replaceMessage(this.messageIndex, updatedMessage);
        }
      }
    })();
  }
}
