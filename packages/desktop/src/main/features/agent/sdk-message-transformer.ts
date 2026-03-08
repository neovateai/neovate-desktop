import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeCodeUIMessageChunk, ClaudeCodeUIEvent } from "../../../shared/features/agent/chat-types";

export class SDKMessageTransformer {
  private inStep = false;
  private currentMessageId: string | null = null;

  *transform(msg: SDKMessage): Generator<ClaudeCodeUIMessageChunk> {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          this.inStep = false;
          this.currentMessageId = null;
          yield { type: "start", messageId: msg.uuid, messageMetadata: { sessionId: msg.session_id, parentToolUseId: null } } as any;
          yield { type: "data-system/init", data: msg } as any;
        } else if (msg.subtype === "compact_boundary") {
          yield { type: "data-system/compact_boundary", data: msg } as any;
        }
        break;
      }

      case "assistant": {
        const isNewStep = msg.message.id !== this.currentMessageId;
        if (isNewStep) {
          if (this.inStep) yield { type: "finish-step" } as any;
          yield { type: "start-step" } as any;
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
        if (this.inStep) yield { type: "finish-step" } as any;
        if (msg.subtype !== "success") {
          yield { type: "error", errorText: (msg as any).errors?.join("\n") || msg.subtype } as any;
        }
        yield { type: "finish" } as any;
        this.inStep = false;
        this.currentMessageId = null;
        break;
      }
    }
  }

  private *transformAssistant(msg: SDKMessage & { type: "assistant" }): Generator<ClaudeCodeUIMessageChunk> {
    for (const part of msg.message.content) {
      switch (part.type) {
        case "text": {
          yield { type: "text-start", id: msg.message.id } as any;
          yield { type: "text-delta", id: msg.message.id, delta: part.text } as any;
          yield { type: "text-end", id: msg.message.id } as any;
          break;
        }
        case "thinking": {
          yield { type: "reasoning-start", id: msg.message.id } as any;
          yield { type: "reasoning-delta", id: msg.message.id, delta: (part as any).thinking } as any;
          yield {
            type: "reasoning-end",
            id: msg.message.id,
            providerMetadata: { claudeCode: { signature: (part as any).signature } },
          } as any;
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
          } as any;
          break;
        }
      }
    }
  }

  private *transformUser(msg: SDKMessage & { type: "user" }): Generator<ClaudeCodeUIMessageChunk> {
    const message = msg as any;
    const content = message.message?.content;

    if (typeof content === "string") {
      yield { type: "text-start", id: message.uuid } as any;
      yield { type: "text-delta", id: message.uuid, delta: content } as any;
      yield { type: "text-end", id: message.uuid } as any;
      return;
    }

    if (!Array.isArray(content)) return;

    for (const part of content) {
      switch (part.type) {
        case "tool_result": {
          const providerMetadata = this.claudeCodeMetadata(message.parent_tool_use_id);
          if (part.is_error) {
            yield {
              type: "tool-output-error",
              toolCallId: part.tool_use_id,
              errorText: typeof part.content === "string" ? part.content : "",
              providerExecuted: true,
              providerMetadata,
            } as any;
          } else {
            yield {
              type: "tool-output-available",
              toolCallId: part.tool_use_id,
              output: part.content,
              providerExecuted: true,
              providerMetadata,
            } as any;
          }
          break;
        }
        case "text": {
          yield { type: "text-start", id: message.uuid } as any;
          yield { type: "text-delta", id: message.uuid, delta: part.text } as any;
          yield { type: "text-end", id: message.uuid } as any;
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
