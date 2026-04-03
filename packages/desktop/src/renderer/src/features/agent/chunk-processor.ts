/**
 * 1:1 port of AI SDK v6's processUIMessageStream chunk processing logic.
 * Source: ai/packages/ai/src/ui/process-ui-message-stream.ts
 *
 * The only adaptation is the input interface: AI SDK reads from a ReadableStream
 * via TransformStream, we receive chunks via processChunk() method calls.
 * All part assembly logic, field names, and state transitions are identical.
 *
 * Generic over UIMessage — no coupling to ClaudeCode-specific types.
 */
import {
  getStaticToolName,
  isStaticToolUIPart,
  isToolUIPart,
  parsePartialJson,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

// ── Helpers not exported by AI SDK ──────────────────────────────────────────

function isDynamicToolUIPart(part: { type: string }): boolean {
  return part.type === "dynamic-tool";
}

function isDataUIMessageChunk(chunk: { type: string }): boolean {
  return chunk.type.startsWith("data-");
}

// ai/src/util/merge-objects.ts (not exported)
function mergeObjects<T extends object, U extends object>(
  base: T | undefined,
  overrides: U | undefined,
): (T & U) | T | U | undefined {
  if (base === undefined && overrides === undefined) return undefined;
  if (base === undefined) return overrides;
  if (overrides === undefined) return base;

  const result = { ...base } as T & U;
  for (const key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const overridesValue = overrides[key];
      if (overridesValue === undefined) continue;
      const baseValue = key in base ? base[key as unknown as keyof T] : undefined;

      const isSourceObject =
        overridesValue !== null &&
        typeof overridesValue === "object" &&
        !Array.isArray(overridesValue) &&
        !(overridesValue instanceof Date) &&
        !(overridesValue instanceof RegExp);
      const isTargetObject =
        baseValue !== null &&
        baseValue !== undefined &&
        typeof baseValue === "object" &&
        !Array.isArray(baseValue) &&
        !(baseValue instanceof Date) &&
        !(baseValue instanceof RegExp);

      if (isSourceObject && isTargetObject) {
        result[key as keyof (T & U)] = mergeObjects(
          baseValue as object,
          overridesValue as object,
        ) as (T & U)[keyof (T & U)];
      } else {
        result[key as keyof (T & U)] = overridesValue as (T & U)[keyof (T & U)];
      }
    }
  }
  return result;
}

// ── State interface ─────────────────────────────────────────────────────────

export interface ChunkProcessorState<M extends UIMessage> {
  messages: M[];
  pushMessage(msg: M): void;
  replaceMessage(index: number, msg: M): void;
  error: Error | undefined;
  status: string;
}

// ── ChunkProcessor ──────────────────────────────────────────────────────────

/**
 * 1:1 port of AI SDK v6's processUIMessageStream.
 * Generic over `M extends UIMessage` — works with any UIMessage subtype.
 */
export class ChunkProcessor<M extends UIMessage> {
  private message: M;
  private messageIndex = -1;
  private activeTextParts: Record<string, M["parts"][number]> = {};
  private activeReasoningParts: Record<string, M["parts"][number]> = {};
  private partialToolCalls: Record<
    string,
    { text: string; toolName: string; index: number; dynamic?: boolean; title?: string }
  > = {};
  finishReason: string | undefined;

  constructor(private state: ChunkProcessorState<M>) {
    this.message = { id: "", role: "assistant", parts: [], metadata: undefined } as unknown as M;
  }

  resetTurn() {
    this.message = { id: "", role: "assistant", parts: [], metadata: undefined } as unknown as M;
    this.messageIndex = -1;
    this.activeTextParts = {};
    this.activeReasoningParts = {};
    this.partialToolCalls = {};
  }

  async processChunk(chunk: UIMessageChunk) {
    // Use `any` for chunk field access — matches AI SDK's internal pattern
    // (processUIMessageStream also uses `as any` extensively for chunk fields)
    const c = chunk as Record<string, unknown>;
    const parts = this.message.parts as Record<string, unknown>[];

    switch (chunk.type) {
      // ── Message lifecycle ─────────────────────────────────────
      case "start": {
        if (c.messageId != null) {
          (this.message as { id: string }).id = c.messageId as string;
        }
        this.updateMessageMetadata(c.messageMetadata);
        this.state.pushMessage(this.message);
        this.messageIndex = this.state.messages.length - 1;
        if (c.messageId != null || c.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      case "finish": {
        if (c.finishReason != null) {
          this.finishReason = c.finishReason as string;
        }
        this.updateMessageMetadata(c.messageMetadata);
        if (c.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      case "message-metadata": {
        this.updateMessageMetadata(c.messageMetadata);
        if (c.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      // ── Text ──────────────────────────────────────────────────
      case "text-start": {
        const textPart = {
          type: "text" as const,
          text: "",
          providerMetadata: c.providerMetadata,
          state: "streaming" as const,
        };
        this.activeTextParts[c.id as string] = textPart as M["parts"][number];
        parts.push(textPart);
        this.flush();
        break;
      }

      case "text-delta": {
        const textPart = this.activeTextParts[c.id as string] as
          | Record<string, unknown>
          | undefined;
        if (textPart == null) break;
        (textPart as { text: string }).text += c.delta as string;
        textPart.providerMetadata = c.providerMetadata ?? textPart.providerMetadata;
        this.flush();
        break;
      }

      case "text-end": {
        const textPart = this.activeTextParts[c.id as string] as
          | Record<string, unknown>
          | undefined;
        if (textPart == null) break;
        textPart.state = "done";
        textPart.providerMetadata = c.providerMetadata ?? textPart.providerMetadata;
        delete this.activeTextParts[c.id as string];
        this.flush();
        break;
      }

      // ── Custom ────────────────────────────────────────────────
      case "custom": {
        parts.push({ type: "custom", kind: c.kind, providerMetadata: c.providerMetadata });
        this.flush();
        break;
      }

      // ── Reasoning ─────────────────────────────────────────────
      case "reasoning-start": {
        const reasoningPart = {
          type: "reasoning" as const,
          text: "",
          providerMetadata: c.providerMetadata,
          state: "streaming" as const,
        };
        this.activeReasoningParts[c.id as string] = reasoningPart as M["parts"][number];
        parts.push(reasoningPart);
        this.flush();
        break;
      }

      case "reasoning-delta": {
        const reasoningPart = this.activeReasoningParts[c.id as string] as
          | Record<string, unknown>
          | undefined;
        if (reasoningPart == null) break;
        (reasoningPart as { text: string }).text += c.delta as string;
        reasoningPart.providerMetadata = c.providerMetadata ?? reasoningPart.providerMetadata;
        this.flush();
        break;
      }

      case "reasoning-end": {
        const reasoningPart = this.activeReasoningParts[c.id as string] as
          | Record<string, unknown>
          | undefined;
        if (reasoningPart == null) break;
        reasoningPart.providerMetadata = c.providerMetadata ?? reasoningPart.providerMetadata;
        reasoningPart.state = "done";
        delete this.activeReasoningParts[c.id as string];
        this.flush();
        break;
      }

      // ── File / Source ─────────────────────────────────────────
      case "file":
      case "reasoning-file": {
        parts.push({
          type: chunk.type,
          mediaType: c.mediaType,
          url: c.url,
          ...(c.providerMetadata != null ? { providerMetadata: c.providerMetadata } : {}),
        });
        this.flush();
        break;
      }

      case "source-url": {
        parts.push({
          type: "source-url",
          sourceId: c.sourceId,
          url: c.url,
          title: c.title,
          providerMetadata: c.providerMetadata,
        });
        this.flush();
        break;
      }

      case "source-document": {
        parts.push({
          type: "source-document",
          sourceId: c.sourceId,
          mediaType: c.mediaType,
          title: c.title,
          filename: c.filename,
          providerMetadata: c.providerMetadata,
        });
        this.flush();
        break;
      }

      // ── Tool input ────────────────────────────────────────────
      case "tool-input-start": {
        const toolInvocations = parts.filter((p) => isStaticToolUIPart(p as M["parts"][number]));
        this.partialToolCalls[c.toolCallId as string] = {
          text: "",
          toolName: c.toolName as string,
          index: toolInvocations.length,
          dynamic: c.dynamic as boolean | undefined,
          title: c.title as string | undefined,
        };
        if (c.dynamic) {
          this.updateDynamicToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "input-streaming",
            input: undefined,
            providerExecuted: c.providerExecuted,
            title: c.title,
            providerMetadata: c.providerMetadata,
          });
        } else {
          this.updateToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "input-streaming",
            input: undefined,
            providerExecuted: c.providerExecuted,
            title: c.title,
            providerMetadata: c.providerMetadata,
          });
        }
        this.flush();
        break;
      }

      case "tool-input-delta": {
        const partialToolCall = this.partialToolCalls[c.toolCallId as string];
        if (partialToolCall == null) break;
        partialToolCall.text += c.inputTextDelta as string;
        const { value: partialArgs } = await parsePartialJson(partialToolCall.text);
        if (partialToolCall.dynamic) {
          this.updateDynamicToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: partialToolCall.toolName,
            state: "input-streaming",
            input: partialArgs,
            title: partialToolCall.title,
          });
        } else {
          this.updateToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: partialToolCall.toolName,
            state: "input-streaming",
            input: partialArgs,
            title: partialToolCall.title,
          });
        }
        this.flush();
        break;
      }

      case "tool-input-available": {
        if (c.dynamic) {
          this.updateDynamicToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "input-available",
            input: c.input,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: c.title,
          });
        } else {
          this.updateToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "input-available",
            input: c.input,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: c.title,
          });
        }
        this.flush();
        break;
      }

      case "tool-input-error": {
        const existingPart = parts
          .filter((p) => isToolUIPart(p as M["parts"][number]))
          .find((p) => p.toolCallId === c.toolCallId);
        const isDynamic =
          existingPart != null
            ? isDynamicToolUIPart(existingPart as { type: string })
            : !!c.dynamic;
        if (isDynamic) {
          this.updateDynamicToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "output-error",
            input: c.input,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
          });
        } else {
          this.updateToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "output-error",
            input: undefined,
            rawInput: c.input,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
          });
        }
        this.flush();
        break;
      }

      case "tool-approval-request": {
        const inv = this.getToolInvocation(parts, c.toolCallId as string);
        if (inv) {
          inv.state = "approval-requested";
          inv.approval = { id: c.approvalId };
        }
        this.flush();
        break;
      }

      case "tool-output-denied": {
        const inv = this.getToolInvocation(parts, c.toolCallId as string);
        if (inv) inv.state = "output-denied";
        this.flush();
        break;
      }

      // ── Tool output ───────────────────────────────────────────
      case "tool-output-available": {
        const inv = this.getToolInvocation(parts, c.toolCallId as string);
        if (inv == null) break;
        if (isDynamicToolUIPart(inv as { type: string })) {
          this.updateDynamicToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: inv.toolName,
            state: "output-available",
            input: inv.input,
            output: c.output,
            preliminary: c.preliminary,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: inv.title,
          });
        } else {
          this.updateToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: getStaticToolName(inv as M["parts"][number]),
            state: "output-available",
            input: inv.input,
            output: c.output,
            providerExecuted: c.providerExecuted,
            preliminary: c.preliminary,
            providerMetadata: c.providerMetadata,
            title: inv.title,
          });
        }
        this.flush();
        break;
      }

      case "tool-output-error": {
        const inv = this.getToolInvocation(parts, c.toolCallId as string);
        if (inv == null) break;
        if (isDynamicToolUIPart(inv as { type: string })) {
          this.updateDynamicToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: inv.toolName,
            state: "output-error",
            input: inv.input,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: inv.title,
          });
        } else {
          this.updateToolPart(parts, {
            toolCallId: c.toolCallId,
            toolName: getStaticToolName(inv as M["parts"][number]),
            state: "output-error",
            input: inv.input,
            rawInput: inv.rawInput,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: inv.title,
          });
        }
        this.flush();
        break;
      }

      // ── Steps ─────────────────────────────────────────────────
      case "start-step": {
        parts.push({ type: "step-start" });
        break;
      }

      case "finish-step": {
        this.activeTextParts = {};
        this.activeReasoningParts = {};
        break;
      }

      // ── Error ─────────────────────────────────────────────────
      case "error": {
        this.state.error = new Error(c.errorText as string);
        this.state.status = "error";
        break;
      }

      // ── Data parts ────────────────────────────────────────────
      default: {
        if (isDataUIMessageChunk(chunk)) {
          if (c.transient) break;
          const existingUIPart =
            c.id != null ? parts.find((p) => c.type === p.type && c.id === p.id) : undefined;
          if (existingUIPart != null) {
            existingUIPart.data = c.data;
          } else {
            parts.push(c as Record<string, unknown>);
          }
          this.flush();
        }
        break;
      }
    }
  }

  // ── Private helpers (1:1 with AI SDK) ─────────────────────────

  private updateMessageMetadata(metadata: unknown) {
    if (metadata != null) {
      const msg = this.message as { metadata: unknown };
      msg.metadata =
        msg.metadata != null ? mergeObjects(msg.metadata as object, metadata as object) : metadata;
    }
  }

  private getToolInvocation(
    parts: Record<string, unknown>[],
    toolCallId: string,
  ): Record<string, unknown> | undefined {
    return parts
      .filter((p) => isToolUIPart(p as M["parts"][number]))
      .find((p) => p.toolCallId === toolCallId);
  }

  private updateToolPart(parts: Record<string, unknown>[], options: Record<string, unknown>) {
    const part = parts.find(
      (p) => isStaticToolUIPart(p as M["parts"][number]) && p.toolCallId === options.toolCallId,
    );
    if (part != null) {
      part.state = options.state;
      part.input = options.input;
      part.output = options.output;
      part.errorText = options.errorText;
      part.rawInput = options.rawInput;
      part.preliminary = options.preliminary;
      if (options.title !== undefined) part.title = options.title;
      part.providerExecuted = options.providerExecuted ?? part.providerExecuted;
      if (options.providerMetadata != null) {
        if (options.state === "output-available" || options.state === "output-error") {
          part.resultProviderMetadata = options.providerMetadata;
        } else {
          part.callProviderMetadata = options.providerMetadata;
        }
      }
    } else {
      parts.push({
        type: `tool-${options.toolName as string}`,
        toolCallId: options.toolCallId,
        state: options.state,
        title: options.title,
        input: options.input,
        output: options.output,
        rawInput: options.rawInput,
        errorText: options.errorText,
        providerExecuted: options.providerExecuted,
        preliminary: options.preliminary,
        ...(options.providerMetadata != null &&
        (options.state === "output-available" || options.state === "output-error")
          ? { resultProviderMetadata: options.providerMetadata }
          : {}),
        ...(options.providerMetadata != null &&
        !(options.state === "output-available" || options.state === "output-error")
          ? { callProviderMetadata: options.providerMetadata }
          : {}),
      });
    }
  }

  private updateDynamicToolPart(
    parts: Record<string, unknown>[],
    options: Record<string, unknown>,
  ) {
    const part = parts.find(
      (p) => p.type === "dynamic-tool" && p.toolCallId === options.toolCallId,
    );
    if (part != null) {
      part.state = options.state;
      part.toolName = options.toolName;
      part.input = options.input;
      part.output = options.output;
      part.errorText = options.errorText;
      part.rawInput = options.rawInput ?? part.rawInput;
      part.preliminary = options.preliminary;
      if (options.title !== undefined) part.title = options.title;
      part.providerExecuted = options.providerExecuted ?? part.providerExecuted;
      if (options.providerMetadata != null) {
        if (options.state === "output-available" || options.state === "output-error") {
          part.resultProviderMetadata = options.providerMetadata;
        } else {
          part.callProviderMetadata = options.providerMetadata;
        }
      }
    } else {
      parts.push({
        type: "dynamic-tool",
        toolName: options.toolName,
        toolCallId: options.toolCallId,
        state: options.state,
        input: options.input,
        output: options.output,
        errorText: options.errorText,
        preliminary: options.preliminary,
        providerExecuted: options.providerExecuted,
        title: options.title,
        ...(options.providerMetadata != null &&
        (options.state === "output-available" || options.state === "output-error")
          ? { resultProviderMetadata: options.providerMetadata }
          : {}),
        ...(options.providerMetadata != null &&
        !(options.state === "output-available" || options.state === "output-error")
          ? { callProviderMetadata: options.providerMetadata }
          : {}),
      });
    }
  }

  private flush() {
    if (this.messageIndex < 0) return;
    this.state.replaceMessage(this.messageIndex, this.message);
  }
}
