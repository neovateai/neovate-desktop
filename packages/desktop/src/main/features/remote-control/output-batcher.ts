import debug from "debug";

import type { ConversationRef } from "../../../shared/features/remote-control/types";
import type { RemoteControlPlatformAdapter } from "./platforms/types";

const log = debug("neovate:remote-control:batcher");

const DEBOUNCE_MS = 650;
const EAGER_THRESHOLD = 220;
const SETTLE_DELAY_MS = 1500;
const CODE_BLOCK_LINE_LIMIT = 50;

export class OutputBatcher {
  private buffer = "";
  /** Accumulated full text for the current turn — edits send the full text, not just the delta. */
  private fullText = "";
  private currentMessageId: string | null = null;
  private currentMessageTimestamp: number | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private ref: ConversationRef,
    private adapter: RemoteControlPlatformAdapter,
  ) {}

  /** Append text delta to the buffer. Flushes when debounce or threshold is hit. */
  append(text: string): void {
    if (this.disposed) return;
    this.buffer += text;

    if (this.buffer.length >= EAGER_THRESHOLD) {
      log("eager flush: buffer=%d chars (threshold=%d)", this.buffer.length, EAGER_THRESHOLD);
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /** Force flush any buffered content. */
  async flush(): Promise<void> {
    if (this.disposed) return;
    this.clearTimers();

    const newText = this.buffer;
    if (!newText) return;
    this.buffer = "";
    this.fullText += newText;

    log(
      "flush: +%d chars, total=%d chars, currentMsgId=%s",
      newText.length,
      this.fullText.length,
      this.currentMessageId ?? "(none)",
    );

    // Check for long code blocks — send as file instead
    const codeBlockMatch = this.fullText.match(/```[\s\S]*?```/g);
    if (codeBlockMatch) {
      for (const block of codeBlockMatch) {
        const lines = block.split("\n");
        if (lines.length > CODE_BLOCK_LINE_LIMIT) {
          const content = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          try {
            await this.adapter.sendFile(this.ref, Buffer.from(content), "output.txt");
          } catch (err) {
            log("sendFile failed, falling back to message: %O", err);
            await this.sendOrEdit(this.fullText);
          }
          return;
        }
      }
    }

    await this.sendOrEdit(this.fullText);
  }

  /** Signal that the turn has completed. Waits for settle delay then flushes. */
  onTurnComplete(): void {
    if (this.disposed) return;
    this.clearTimers();

    this.settleTimer = setTimeout(() => {
      void this.flush();
      this.currentMessageId = null;
      this.currentMessageTimestamp = null;
      this.fullText = "";
    }, SETTLE_DELAY_MS);
  }

  /** Reset state for a new turn. */
  reset(): void {
    this.clearTimers();
    this.buffer = "";
    this.fullText = "";
    this.currentMessageId = null;
    this.currentMessageTimestamp = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.buffer = "";
    this.fullText = "";
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  private async sendOrEdit(text: string): Promise<void> {
    const maxLen = this.adapter.maxMessageLength;

    // Telegram edit window is 48 hours
    const editExpired =
      this.currentMessageTimestamp != null &&
      Date.now() - this.currentMessageTimestamp > 47 * 3600_000;

    if (editExpired) {
      log("edit window expired for msgId=%s, sending new message", this.currentMessageId);
    }

    if (this.currentMessageId && !editExpired) {
      try {
        // Split if needed
        if (text.length > maxLen) {
          await this.sendChunked(text);
          return;
        }
        await this.adapter.editMessage(this.ref, this.currentMessageId, text);
        return;
      } catch {
        // Edit failed — fall through to send new message
        log("editMessage failed, sending new message");
      }
    }

    await this.sendChunked(text);
  }

  private async sendChunked(text: string): Promise<void> {
    const maxLen = this.adapter.maxMessageLength;
    const chunks = splitText(text, maxLen);

    for (const chunk of chunks) {
      try {
        const msgId = await this.adapter.sendMessage({ ref: this.ref, text: chunk });
        // Track the last message for subsequent edits
        this.currentMessageId = msgId;
        this.currentMessageTimestamp = Date.now();
      } catch (err) {
        log("sendMessage failed: %O", err);
      }
    }
  }
}

/** Split text into chunks respecting maxLen, preferring line boundaries. */
function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline
    let breakAt = remaining.lastIndexOf("\n", maxLen);
    if (breakAt < maxLen * 0.5) {
      // No good newline break — break at maxLen
      breakAt = maxLen;
    }

    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }

  return chunks;
}

export class OutputBatcherPool {
  private batchers = new Map<string, OutputBatcher>();

  private key(ref: ConversationRef): string {
    return `${ref.platformId}:${ref.chatId}:${ref.threadId ?? ""}`;
  }

  getOrCreate(ref: ConversationRef, adapter: RemoteControlPlatformAdapter): OutputBatcher {
    const k = this.key(ref);
    let batcher = this.batchers.get(k);
    if (!batcher) {
      batcher = new OutputBatcher(ref, adapter);
      this.batchers.set(k, batcher);
    }
    return batcher;
  }

  dispose(ref: ConversationRef): void {
    const k = this.key(ref);
    this.batchers.get(k)?.dispose();
    this.batchers.delete(k);
  }

  disposeAll(): void {
    for (const batcher of this.batchers.values()) {
      batcher.dispose();
    }
    this.batchers.clear();
  }
}
