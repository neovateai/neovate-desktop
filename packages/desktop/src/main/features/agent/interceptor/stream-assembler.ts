/**
 * Per-request SSE stream assembler that reconstructs a complete Anthropic
 * Messages API response from streaming SSE events.
 *
 * Each patched fetch call creates its own instance — no shared state.
 * This is critical because the SDK can have multiple concurrent in-flight
 * requests (main agent + sub-agents making parallel tool calls).
 */

/**
 * Reconstructs a complete Anthropic Messages API response object from
 * a sequence of streaming SSE events.
 */
export class StreamAssembler {
  private message: Record<string, any> = {};
  private contentBlocks: any[] = [];
  private activeBlockIndex = -1;
  private inputJsonBuffer = "";

  /**
   * Process a single parsed SSE event. Call in order for each event
   * received from the stream.
   */
  processEvent(event: { type: string; [key: string]: any }): void {
    switch (event.type) {
      case "message_start":
        this.handleMessageStart(event);
        break;
      case "content_block_start":
        this.handleContentBlockStart(event);
        break;
      case "content_block_delta":
        this.handleContentBlockDelta(event);
        break;
      case "content_block_stop":
        this.handleContentBlockStop(event);
        break;
      case "message_delta":
        this.handleMessageDelta(event);
        break;
      case "message_stop":
        // No-op: the message is already fully assembled.
        break;
    }
  }

  /**
   * Return the fully assembled Messages API response object.
   * Call after the stream ends (after message_stop, or on stream close).
   */
  finalize(): Record<string, any> {
    return { ...this.message, content: this.contentBlocks };
  }

  // -- Event handlers --------------------------------------------------------

  private handleMessageStart(event: { type: string; [key: string]: any }): void {
    const msg = event.message;
    if (msg == null || typeof msg !== "object") return;

    this.message = {
      id: msg.id,
      type: msg.type ?? "message",
      role: msg.role ?? "assistant",
      model: msg.model,
      stop_reason: msg.stop_reason ?? null,
      stop_sequence: msg.stop_sequence ?? null,
      usage: msg.usage ? { ...msg.usage } : { input_tokens: 0, output_tokens: 0 },
    };
    this.contentBlocks = [];
  }

  private handleContentBlockStart(event: { type: string; [key: string]: any }): void {
    const block = event.content_block;
    if (block == null || typeof block !== "object") return;

    const index = typeof event.index === "number" ? event.index : this.contentBlocks.length;

    switch (block.type) {
      case "text":
        this.setBlock(index, { type: "text", text: block.text ?? "" });
        break;
      case "thinking":
        this.setBlock(index, {
          type: "thinking",
          thinking: block.thinking ?? "",
          signature: block.signature ?? "",
        });
        break;
      case "redacted_thinking":
        this.setBlock(index, { type: "redacted_thinking", data: block.data ?? "" });
        break;
      case "tool_use":
        this.setBlock(index, {
          type: "tool_use",
          id: block.id ?? "",
          name: block.name ?? "",
          input: {},
        });
        this.inputJsonBuffer = "";
        break;
      default:
        // Unknown block type — preserve as-is so finalize() doesn't lose data.
        this.setBlock(index, { ...block });
        break;
    }

    this.activeBlockIndex = index;
  }

  private handleContentBlockDelta(event: { type: string; [key: string]: any }): void {
    const delta = event.delta;
    if (delta == null || typeof delta !== "object") return;

    const index = typeof event.index === "number" ? event.index : this.activeBlockIndex;
    const block = this.contentBlocks[index];
    if (block == null) return;

    switch (delta.type) {
      case "text_delta":
        if (block.type === "text" && typeof delta.text === "string") {
          block.text += delta.text;
        }
        break;
      case "thinking_delta":
        if (block.type === "thinking" && typeof delta.thinking === "string") {
          block.thinking += delta.thinking;
        }
        break;
      case "input_json_delta":
        if (block.type === "tool_use" && typeof delta.partial_json === "string") {
          this.inputJsonBuffer += delta.partial_json;
        }
        break;
      case "signature_delta":
        if (block.type === "thinking" && typeof delta.signature === "string") {
          block.signature = delta.signature;
        }
        break;
    }
  }

  private handleContentBlockStop(event: { type: string; [key: string]: any }): void {
    const index = typeof event.index === "number" ? event.index : this.activeBlockIndex;
    const block = this.contentBlocks[index];

    if (block != null && block.type === "tool_use") {
      // Parse the accumulated JSON input buffer.
      if (this.inputJsonBuffer.length > 0) {
        try {
          block.input = JSON.parse(this.inputJsonBuffer);
        } catch {
          // Malformed JSON — store the raw string so the data isn't lost.
          block.input = this.inputJsonBuffer;
        }
      }
      this.inputJsonBuffer = "";
    }

    this.activeBlockIndex = -1;
  }

  private handleMessageDelta(event: { type: string; [key: string]: any }): void {
    const delta = event.delta;
    if (delta != null && typeof delta === "object") {
      if (delta.stop_reason !== undefined) {
        this.message.stop_reason = delta.stop_reason;
      }
      if (delta.stop_sequence !== undefined) {
        this.message.stop_sequence = delta.stop_sequence;
      }
    }

    // Merge usage — message_delta carries output_tokens (and sometimes more).
    const usage = event.usage;
    if (usage != null && typeof usage === "object") {
      if (this.message.usage == null) {
        this.message.usage = {};
      }
      for (const key of Object.keys(usage)) {
        const value = usage[key];
        if (typeof value === "number") {
          this.message.usage[key] = value;
        } else if (value != null && typeof value === "object") {
          // Nested objects like server_tool_use — merge shallowly.
          this.message.usage[key] = { ...this.message.usage[key], ...value };
        }
      }
    }
  }

  // -- Helpers ---------------------------------------------------------------

  private setBlock(index: number, block: any): void {
    // Pad the array if needed (indices may not be contiguous, though they
    // normally are with Anthropic's API).
    while (this.contentBlocks.length <= index) {
      this.contentBlocks.push(null);
    }
    this.contentBlocks[index] = block;
  }
}

/**
 * Parse raw SSE text into an array of typed event objects.
 *
 * SSE format:
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * Each block is separated by a blank line (`\n\n`).
 * Returns only successfully parsed events; skips `[DONE]` sentinels
 * and blocks with JSON parse errors.
 */
export function parseSSEEvents(rawText: string): Array<{ type: string; [key: string]: any }> {
  const results: Array<{ type: string; [key: string]: any }> = [];
  // Split on double newline — the SSE block boundary.
  const blocks = rawText.split("\n\n");

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;

    let eventType: string | undefined;
    let dataStr: string | undefined;

    const lines = trimmed.split("\n");
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        const value = line.slice("data:".length).trim();
        // Accumulate data lines (SSE spec allows multiple data: lines per event).
        dataStr = dataStr == null ? value : dataStr + "\n" + value;
      }
    }

    // Skip [DONE] sentinel.
    if (dataStr === "[DONE]") continue;

    if (dataStr == null || dataStr.length === 0) continue;

    try {
      const parsed = JSON.parse(dataStr);
      if (parsed != null && typeof parsed === "object") {
        // Use the event: line as `type` if present, otherwise fall back to
        // the `type` field in the parsed JSON (Anthropic SSE uses both).
        const type = eventType ?? parsed.type;
        if (typeof type === "string") {
          results.push({ ...parsed, type });
        }
      }
    } catch {
      // Malformed JSON — skip this event silently.
    }
  }

  return results;
}
