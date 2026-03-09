import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type {
  ClaudeCodeUIMessageChunk,
  ClaudeCodeUIEvent,
} from "../../../shared/claude-code/types";

export class SDKMessageTransformer {
  private inStep = false;
  private currentMessageId: string | null = null;

  *transform(msg: SDKMessage): Generator<ClaudeCodeUIMessageChunk> {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          this.inStep = false;
          this.currentMessageId = null;
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

      case "result": {
        if (this.inStep) yield { type: "finish-step" };
        if (msg.subtype !== "success") {
          yield { type: "error", errorText: msg.errors.join("\n") || msg.subtype };
        }
        yield { type: "finish" };
        this.inStep = false;
        this.currentMessageId = null;
        break;
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
          yield { type: "reasoning-start", id: msg.message.id };
          yield { type: "reasoning-delta", id: msg.message.id, delta: part.thinking };
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
