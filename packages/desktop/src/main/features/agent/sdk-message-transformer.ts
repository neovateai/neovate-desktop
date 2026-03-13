import type { SDKMessage, SDKPartialAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  BetaRawContentBlockDeltaEvent,
  BetaRawContentBlockStartEvent,
  BetaRawContentBlockStopEvent,
  BetaRawMessageStartEvent,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";

import type {
  ClaudeCodeUIMessageChunk,
  ClaudeCodeUIEvent,
} from "../../../shared/claude-code/types";

type ActiveContentBlock =
  | { type: "text"; id: string }
  | { type: "reasoning"; id: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: string;
      providerExecuted: true;
      providerMetadata?: ReturnType<SDKMessageTransformer["claudeCodeMetadata"]>;
    };

export class SDKMessageTransformer {
  private inStep = false;
  private hasStarted = false;
  private currentMessageId: string | null = null;
  private activeStreamedMessageId: string | null = null;
  private currentParentToolUseId: string | null = null;
  private currentStreamHasUnsupportedBlocks = false;
  private readonly completedStreamedAssistantMessageIds = new Set<string>();
  private readonly contentBlocks = new Map<number, ActiveContentBlock>();

  *transform(msg: SDKMessage): Generator<ClaudeCodeUIMessageChunk> {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          this.inStep = false;
          this.hasStarted = true;
          this.currentMessageId = null;
          this.activeStreamedMessageId = null;
          this.currentParentToolUseId = null;
          this.currentStreamHasUnsupportedBlocks = false;
          yield {
            type: "start",
            messageId: msg.uuid,
            messageMetadata: { sessionId: msg.session_id, parentToolUseId: null },
          };
          yield { type: "data-system/init", data: msg };
        } else if (msg.subtype === "compact_boundary") {
          yield { type: "data-system/compact_boundary", data: msg };
        }
        break;
      }

      case "assistant": {
        if (msg.message.id === this.activeStreamedMessageId) {
          break;
        }
        if (this.completedStreamedAssistantMessageIds.has(msg.message.id)) {
          break;
        }
        if (!this.hasStarted) {
          this.hasStarted = true;
          yield { type: "start", messageId: msg.message.id };
        }
        const isNewStep = msg.message.id !== this.currentMessageId;
        if (isNewStep) {
          if (this.inStep) yield { type: "finish-step" };
          yield { type: "start-step" };
          this.inStep = true;
          this.currentMessageId = msg.message.id;
        }
        yield* this.transformAssistant(msg);
        break;
      }

      case "user": {
        yield* this.transformUser(msg);
        break;
      }

      case "stream_event": {
        yield* this.transformStreamEvent(msg);
        break;
      }

      case "result": {
        if (this.inStep) yield { type: "finish-step" };
        if (msg.subtype !== "success") {
          yield { type: "error", errorText: msg.errors.join("\n") || msg.subtype };
        }
        yield { type: "finish" };
        this.inStep = false;
        this.currentMessageId = null;
        this.activeStreamedMessageId = null;
        this.currentParentToolUseId = null;
        this.currentStreamHasUnsupportedBlocks = false;
        this.contentBlocks.clear();
        break;
      }
    }
  }

  private *transformStreamEvent(
    msg: SDKPartialAssistantMessage,
  ): Generator<ClaudeCodeUIMessageChunk> {
    switch (msg.event.type) {
      case "message_start": {
        yield* this.handleMessageStart(msg, msg.event);
        break;
      }

      case "content_block_start": {
        yield* this.handleContentBlockStart(msg.event);
        break;
      }

      case "content_block_delta": {
        yield* this.handleContentBlockDelta(msg.event);
        break;
      }

      case "content_block_stop": {
        yield* this.handleContentBlockStop(msg.event);
        break;
      }

      case "message_stop": {
        yield* this.handleMessageStop();
        break;
      }

      case "message_delta": {
        break;
      }
    }
  }

  private *handleMessageStop(): Generator<ClaudeCodeUIMessageChunk> {
    if (this.currentMessageId != null && !this.currentStreamHasUnsupportedBlocks) {
      this.completedStreamedAssistantMessageIds.add(this.currentMessageId);
    }
    this.activeStreamedMessageId = null;
  }

  private *handleMessageStart(
    msg: SDKPartialAssistantMessage,
    event: BetaRawMessageStartEvent,
  ): Generator<ClaudeCodeUIMessageChunk> {
    if (!this.hasStarted) {
      this.hasStarted = true;
      yield {
        type: "start",
        messageId: event.message.id,
        messageMetadata: {
          sessionId: msg.session_id,
          parentToolUseId: msg.parent_tool_use_id,
        },
      };
    }

    const isNewStep = event.message.id !== this.currentMessageId;
    if (isNewStep) {
      if (this.inStep) {
        yield { type: "finish-step" };
      }
      yield { type: "start-step" };
      this.inStep = true;
      this.currentMessageId = event.message.id;
      this.contentBlocks.clear();
    }

    this.currentParentToolUseId = msg.parent_tool_use_id;
    this.currentStreamHasUnsupportedBlocks = false;
    this.activeStreamedMessageId = event.message.id;
  }

  private *handleContentBlockStart(
    event: BetaRawContentBlockStartEvent,
  ): Generator<ClaudeCodeUIMessageChunk> {
    if (this.currentMessageId == null || this.contentBlocks.has(event.index)) {
      return;
    }

    switch (event.content_block.type) {
      case "text": {
        const partId = this.textPartId(this.currentMessageId, event.index);
        this.contentBlocks.set(event.index, { type: "text", id: partId });
        yield { type: "text-start", id: partId };
        return;
      }

      case "thinking": {
        const partId = this.reasoningPartId(this.currentMessageId, event.index);
        this.contentBlocks.set(event.index, { type: "reasoning", id: partId });
        yield { type: "reasoning-start", id: partId };
        return;
      }

      case "redacted_thinking": {
        const partId = this.reasoningPartId(this.currentMessageId, event.index);
        this.contentBlocks.set(event.index, { type: "reasoning", id: partId });
        yield {
          type: "reasoning-start",
          id: partId,
          providerMetadata: { anthropic: { redactedData: event.content_block.data } },
        };
        return;
      }

      case "tool_use": {
        yield* this.handleToolUseBlockStart(event.content_block, event.index);
        return;
      }

      default: {
        this.currentStreamHasUnsupportedBlocks = true;
        return;
      }
    }
  }

  private *handleToolUseBlockStart(
    contentBlock: BetaToolUseBlock,
    index: number,
  ): Generator<ClaudeCodeUIMessageChunk> {
    const initialInput =
      contentBlock.input != null &&
      typeof contentBlock.input === "object" &&
      Object.keys(contentBlock.input).length > 0
        ? JSON.stringify(contentBlock.input)
        : "";

    const providerMetadata = this.claudeCodeMetadata(this.currentParentToolUseId);
    this.contentBlocks.set(index, {
      type: "tool-call",
      toolCallId: contentBlock.id,
      toolName: contentBlock.name,
      input: initialInput,
      providerExecuted: true,
      ...(providerMetadata != null ? { providerMetadata } : {}),
    });

    yield {
      type: "tool-input-start",
      toolCallId: contentBlock.id,
      toolName: contentBlock.name,
      providerExecuted: true,
      ...(providerMetadata != null ? { providerMetadata } : {}),
    };
  }

  private *handleContentBlockDelta(
    event: BetaRawContentBlockDeltaEvent,
  ): Generator<ClaudeCodeUIMessageChunk> {
    const contentBlock = this.contentBlocks.get(event.index);
    if (contentBlock == null) {
      return;
    }

    switch (event.delta.type) {
      case "text_delta": {
        if (contentBlock.type !== "text" || event.delta.text.length === 0) {
          return;
        }

        yield { type: "text-delta", id: contentBlock.id, delta: event.delta.text };
        return;
      }

      case "thinking_delta": {
        if (contentBlock.type !== "reasoning") {
          return;
        }

        yield { type: "reasoning-delta", id: contentBlock.id, delta: event.delta.thinking };
        return;
      }

      case "signature_delta": {
        if (contentBlock.type !== "reasoning") {
          return;
        }

        yield {
          type: "reasoning-delta",
          id: contentBlock.id,
          delta: "",
          providerMetadata: { anthropic: { signature: event.delta.signature } },
        };
        return;
      }

      case "input_json_delta": {
        if (contentBlock.type !== "tool-call" || event.delta.partial_json.length === 0) {
          return;
        }

        yield {
          type: "tool-input-delta",
          toolCallId: contentBlock.toolCallId,
          inputTextDelta: event.delta.partial_json,
        };
        contentBlock.input += event.delta.partial_json;
        return;
      }
    }
  }

  private *handleContentBlockStop(
    event: BetaRawContentBlockStopEvent,
  ): Generator<ClaudeCodeUIMessageChunk> {
    const contentBlock = this.contentBlocks.get(event.index);
    if (contentBlock == null) {
      return;
    }

    this.contentBlocks.delete(event.index);
    switch (contentBlock.type) {
      case "text": {
        yield { type: "text-end", id: contentBlock.id };
        return;
      }
      case "reasoning": {
        yield { type: "reasoning-end", id: contentBlock.id };
        return;
      }
      case "tool-call": {
        const finalInput = contentBlock.input === "" ? "{}" : contentBlock.input;

        try {
          yield {
            type: "tool-input-available",
            toolCallId: contentBlock.toolCallId,
            toolName: contentBlock.toolName,
            input: JSON.parse(finalInput),
            providerExecuted: contentBlock.providerExecuted,
            ...(contentBlock.providerMetadata != null
              ? { providerMetadata: contentBlock.providerMetadata }
              : {}),
          };
        } catch (error) {
          yield {
            type: "tool-input-error",
            toolCallId: contentBlock.toolCallId,
            toolName: contentBlock.toolName,
            input: finalInput,
            errorText: error instanceof Error ? error.message : "Invalid tool input JSON",
            providerExecuted: contentBlock.providerExecuted,
            ...(contentBlock.providerMetadata != null
              ? { providerMetadata: contentBlock.providerMetadata }
              : {}),
          };
        }
        return;
      }
    }
  }

  private *transformAssistant(
    msg: SDKMessage & { type: "assistant" },
  ): Generator<ClaudeCodeUIMessageChunk> {
    for (const part of msg.message.content) {
      switch (part.type) {
        case "text": {
          yield { type: "text-start", id: msg.message.id };
          yield { type: "text-delta", id: msg.message.id, delta: part.text };
          yield { type: "text-end", id: msg.message.id };
          break;
        }
        case "thinking": {
          yield {
            type: "reasoning-start",
            id: msg.message.id,
            providerMetadata: { anthropic: { signature: part.signature } },
          };
          yield { type: "reasoning-delta", id: msg.message.id, delta: part.thinking };
          yield { type: "reasoning-end", id: msg.message.id };
          break;
        }
        case "redacted_thinking": {
          yield {
            type: "reasoning-start",
            id: msg.message.id,
            providerMetadata: { anthropic: { redactedData: part.data } },
          };
          yield { type: "reasoning-end", id: msg.message.id };
          break;
        }
        case "tool_use": {
          yield {
            type: "tool-input-available",
            toolCallId: part.id,
            toolName: part.name,
            input: part.input,
            providerExecuted: true,
            providerMetadata: this.claudeCodeMetadata(msg.parent_tool_use_id),
          };
          break;
        }
      }
    }
  }

  private *transformUser(msg: SDKMessage & { type: "user" }): Generator<ClaudeCodeUIMessageChunk> {
    const message = msg as any;
    const content = message.message?.content;

    if (typeof content === "string") {
      yield { type: "text-start", id: message.uuid };
      yield { type: "text-delta", id: message.uuid, delta: content };
      yield { type: "text-end", id: message.uuid };
      return;
    }

    if (!Array.isArray(content)) return;

    for (const part of content) {
      switch (part.type) {
        case "tool_result": {
          if (part.is_error) {
            yield {
              type: "tool-output-error",
              toolCallId: part.tool_use_id,
              errorText: typeof part.content === "string" ? part.content : "",
              providerExecuted: true,
            };
          } else {
            yield {
              type: "tool-output-available",
              toolCallId: part.tool_use_id,
              output: part.content,
              providerExecuted: true,
            };
          }
          break;
        }
        case "text": {
          yield { type: "text-start", id: message.uuid };
          yield { type: "text-delta", id: message.uuid, delta: part.text };
          yield { type: "text-end", id: message.uuid };
          break;
        }
      }
    }
  }

  private claudeCodeMetadata(parentToolUseId: string | null | undefined) {
    return parentToolUseId ? { claudeCode: { parentToolUseId } } : undefined;
  }

  private textPartId(messageId: string, index: number) {
    return `text:${messageId}:${index}`;
  }

  private reasoningPartId(messageId: string, index: number) {
    return `reasoning:${messageId}:${index}`;
  }
}

/**
 * Convert SDK message to a subscribe-stream event.
 * Returns null for messages handled by the message stream
 * (assistant, user, system/init, system/compact_boundary).
 */
export function toUIEvent(msg: SDKMessage): ClaudeCodeUIEvent | null {
  switch (msg.type) {
    case "result":
    case "tool_progress":
    case "tool_use_summary":
    case "auth_status":
    case "prompt_suggestion":
    case "rate_limit_event": {
      return { kind: "event", event: { id: (msg as any).uuid ?? crypto.randomUUID(), ...msg } };
    }
    case "system": {
      if (msg.subtype === "init" || msg.subtype === "compact_boundary") return null;
      return { kind: "event", event: { id: (msg as any).uuid ?? crypto.randomUUID(), ...msg } };
    }
    default:
      return null;
  }
}
