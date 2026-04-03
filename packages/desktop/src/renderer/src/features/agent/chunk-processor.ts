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
        (result as any)[key] = mergeObjects(baseValue as object, overridesValue as object);
      } else {
        (result as any)[key] = overridesValue;
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
    switch (chunk.type) {
      // ── Message lifecycle ─────────────────────────────────────
      case "start": {
        if (chunk.messageId != null) {
          (this.message as { id: string }).id = chunk.messageId;
        }
        this.updateMessageMetadata(chunk.messageMetadata);
        this.state.pushMessage(this.message);
        this.messageIndex = this.state.messages.length - 1;
        if (chunk.messageId != null || chunk.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      case "finish": {
        if (chunk.finishReason != null) {
          this.finishReason = chunk.finishReason;
        }
        this.updateMessageMetadata(chunk.messageMetadata);
        if (chunk.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      case "message-metadata": {
        this.updateMessageMetadata(chunk.messageMetadata);
        if (chunk.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      // ── Text ──────────────────────────────────────────────────
      case "text-start": {
        const textPart = {
          type: "text" as const,
          text: "",
          providerMetadata: chunk.providerMetadata,
          state: "streaming" as const,
        };
        this.activeTextParts[chunk.id] = textPart as M["parts"][number];
        this.message.parts.push(textPart as M["parts"][number]);
        this.flush();
        break;
      }

      case "text-delta": {
        const textPart = this.activeTextParts[chunk.id];
        if (textPart == null) break;
        const anyPart = textPart as any;
        anyPart.text += chunk.delta;
        anyPart.providerMetadata = chunk.providerMetadata ?? anyPart.providerMetadata;
        this.flush();
        break;
      }

      case "text-end": {
        const textPart = this.activeTextParts[chunk.id];
        if (textPart == null) break;
        const anyPart = textPart as any;
        anyPart.state = "done";
        anyPart.providerMetadata = chunk.providerMetadata ?? anyPart.providerMetadata;
        delete this.activeTextParts[chunk.id];
        this.flush();
        break;
      }

      // ── Reasoning ─────────────────────────────────────────────
      case "reasoning-start": {
        const reasoningPart = {
          type: "reasoning" as const,
          text: "",
          providerMetadata: chunk.providerMetadata,
          state: "streaming" as const,
        };
        this.activeReasoningParts[chunk.id] = reasoningPart as M["parts"][number];
        this.message.parts.push(reasoningPart as M["parts"][number]);
        this.flush();
        break;
      }

      case "reasoning-delta": {
        const reasoningPart = this.activeReasoningParts[chunk.id];
        if (reasoningPart == null) break;
        const anyPart = reasoningPart as any;
        anyPart.text += chunk.delta;
        anyPart.providerMetadata = chunk.providerMetadata ?? anyPart.providerMetadata;
        this.flush();
        break;
      }

      case "reasoning-end": {
        const reasoningPart = this.activeReasoningParts[chunk.id];
        if (reasoningPart == null) break;
        const anyPart = reasoningPart as any;
        anyPart.providerMetadata = chunk.providerMetadata ?? anyPart.providerMetadata;
        anyPart.state = "done";
        delete this.activeReasoningParts[chunk.id];
        this.flush();
        break;
      }

      // ── File / Source ─────────────────────────────────────────
      case "file": {
        this.message.parts.push({
          type: chunk.type,
          mediaType: chunk.mediaType,
          url: chunk.url,
          ...(chunk.providerMetadata != null ? { providerMetadata: chunk.providerMetadata } : {}),
        } as unknown as M["parts"][number]);
        this.flush();
        break;
      }

      case "source-url": {
        this.message.parts.push({
          type: "source-url",
          sourceId: chunk.sourceId,
          url: chunk.url,
          title: chunk.title,
          providerMetadata: chunk.providerMetadata,
        } as M["parts"][number]);
        this.flush();
        break;
      }

      case "source-document": {
        this.message.parts.push({
          type: "source-document",
          sourceId: chunk.sourceId,
          mediaType: chunk.mediaType,
          title: chunk.title,
          filename: chunk.filename,
          providerMetadata: chunk.providerMetadata,
        } as M["parts"][number]);
        this.flush();
        break;
      }

      // ── Tool input ────────────────────────────────────────────
      case "tool-input-start": {
        const toolInvocations = this.message.parts.filter(isStaticToolUIPart);
        this.partialToolCalls[chunk.toolCallId] = {
          text: "",
          toolName: chunk.toolName,
          index: toolInvocations.length,
          dynamic: chunk.dynamic,
          title: chunk.title,
        };
        if (chunk.dynamic) {
          this.updateDynamicToolPart({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: "input-streaming",
            input: undefined,
            providerExecuted: chunk.providerExecuted,
            title: chunk.title,
            providerMetadata: chunk.providerMetadata,
          });
        } else {
          this.updateToolPart({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: "input-streaming",
            input: undefined,
            providerExecuted: chunk.providerExecuted,
            title: chunk.title,
            providerMetadata: chunk.providerMetadata,
          });
        }
        this.flush();
        break;
      }

      case "tool-input-delta": {
        const partialToolCall = this.partialToolCalls[chunk.toolCallId];
        if (partialToolCall == null) break;
        partialToolCall.text += chunk.inputTextDelta;
        const { value: partialArgs } = await parsePartialJson(partialToolCall.text);
        if (partialToolCall.dynamic) {
          this.updateDynamicToolPart({
            toolCallId: chunk.toolCallId,
            toolName: partialToolCall.toolName,
            state: "input-streaming",
            input: partialArgs,
            title: partialToolCall.title,
          });
        } else {
          this.updateToolPart({
            toolCallId: chunk.toolCallId,
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
        if (chunk.dynamic) {
          this.updateDynamicToolPart({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: "input-available",
            input: chunk.input,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: chunk.providerMetadata,
            title: chunk.title,
          });
        } else {
          this.updateToolPart({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: "input-available",
            input: chunk.input,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: chunk.providerMetadata,
            title: chunk.title,
          });
        }
        this.flush();
        break;
      }

      case "tool-input-error": {
        const existingPart = this.message.parts
          .filter(isToolUIPart)
          .find((p) => p.toolCallId === chunk.toolCallId);
        const isDynamic =
          existingPart != null ? isDynamicToolUIPart(existingPart) : !!chunk.dynamic;
        if (isDynamic) {
          this.updateDynamicToolPart({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: "output-error",
            input: chunk.input,
            errorText: chunk.errorText,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: chunk.providerMetadata,
          });
        } else {
          this.updateToolPart({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            state: "output-error",
            input: undefined,
            rawInput: chunk.input,
            errorText: chunk.errorText,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: chunk.providerMetadata,
          });
        }
        this.flush();
        break;
      }

      case "tool-approval-request": {
        const inv = this.getToolInvocation(chunk.toolCallId);
        if (inv) {
          const anyInv = inv as any;
          anyInv.state = "approval-requested";
          anyInv.approval = { id: chunk.approvalId };
        }
        this.flush();
        break;
      }

      case "tool-output-denied": {
        const inv = this.getToolInvocation(chunk.toolCallId);
        if (inv) {
          const anyInv = inv as any;
          anyInv.state = "output-denied";
        }
        this.flush();
        break;
      }

      // ── Tool output ───────────────────────────────────────────
      case "tool-output-available": {
        const inv = this.getToolInvocation(chunk.toolCallId);
        if (inv == null) break;
        const anyChunk = chunk as any;
        const anyInv = inv as any;
        if (isDynamicToolUIPart(inv)) {
          this.updateDynamicToolPart({
            toolCallId: chunk.toolCallId,
            toolName: anyInv.toolName,
            state: "output-available",
            input: anyInv.input,
            output: chunk.output,
            preliminary: chunk.preliminary,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: anyChunk.providerMetadata,
            title: anyInv.title,
          });
        } else {
          this.updateToolPart({
            toolCallId: chunk.toolCallId,
            toolName: getStaticToolName(inv as any),
            state: "output-available",
            input: anyInv.input,
            output: chunk.output,
            providerExecuted: chunk.providerExecuted,
            preliminary: chunk.preliminary,
            providerMetadata: anyChunk.providerMetadata,
            title: anyInv.title,
          });
        }
        this.flush();
        break;
      }

      case "tool-output-error": {
        const inv = this.getToolInvocation(chunk.toolCallId);
        if (inv == null) break;
        const anyChunk = chunk as any;
        const anyInv = inv as any;
        if (isDynamicToolUIPart(inv)) {
          this.updateDynamicToolPart({
            toolCallId: chunk.toolCallId,
            toolName: anyInv.toolName,
            state: "output-error",
            input: anyInv.input,
            errorText: chunk.errorText,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: anyChunk.providerMetadata,
            title: anyInv.title,
          });
        } else {
          this.updateToolPart({
            toolCallId: chunk.toolCallId,
            toolName: getStaticToolName(inv as any),
            state: "output-error",
            input: anyInv.input,
            rawInput: anyInv.rawInput,
            errorText: chunk.errorText,
            providerExecuted: chunk.providerExecuted,
            providerMetadata: anyChunk.providerMetadata,
            title: anyInv.title,
          });
        }
        this.flush();
        break;
      }

      // ── Steps ─────────────────────────────────────────────────
      case "start-step": {
        this.message.parts.push({ type: "step-start" } as M["parts"][number]);
        this.flush();
        break;
      }

      case "finish-step": {
        this.activeTextParts = {};
        this.activeReasoningParts = {};
        break;
      }

      // ── Error ─────────────────────────────────────────────────
      case "error": {
        this.state.error = new Error(chunk.errorText);
        this.state.status = "error";
        break;
      }

      // ── Data / custom / reasoning-file parts ─────────────────
      default: {
        const anyChunk = chunk as any;
        const chunkType = chunk.type as string;

        // custom chunk (not yet in UIMessageChunk union)
        if (chunkType === "custom") {
          this.message.parts.push({
            type: "custom",
            kind: anyChunk.kind,
            providerMetadata: anyChunk.providerMetadata,
          } as unknown as M["parts"][number]);
          this.flush();
          break;
        }

        // reasoning-file chunk (not yet in UIMessageChunk union)
        if (chunkType === "reasoning-file") {
          this.message.parts.push({
            type: "reasoning-file",
            mediaType: anyChunk.mediaType,
            url: anyChunk.url,
            ...(anyChunk.providerMetadata != null
              ? { providerMetadata: anyChunk.providerMetadata }
              : {}),
          } as unknown as M["parts"][number]);
          this.flush();
          break;
        }

        // data-* chunks
        if (isDataUIMessageChunk(chunk)) {
          if (anyChunk.transient) break;
          const existingUIPart =
            anyChunk.id != null
              ? this.message.parts.find(
                  (p) => anyChunk.type === p.type && anyChunk.id === (p as any).id,
                )
              : undefined;
          if (existingUIPart != null) {
            (existingUIPart as any).data = anyChunk.data;
          } else {
            this.message.parts.push(anyChunk as M["parts"][number]);
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

  private getToolInvocation(toolCallId: string): M["parts"][number] | undefined {
    return this.message.parts.filter(isToolUIPart).find((p) => p.toolCallId === toolCallId);
  }

  private updateToolPart(options: Record<string, unknown>) {
    const part = this.message.parts.find(
      (p) => isStaticToolUIPart(p) && p.toolCallId === options.toolCallId,
    );

    const anyOptions = options as any;

    if (part != null) {
      const anyPart = part as any;
      anyPart.state = options.state;
      anyPart.input = anyOptions.input;
      anyPart.output = anyOptions.output;
      anyPart.errorText = anyOptions.errorText;
      anyPart.rawInput = anyOptions.rawInput;
      anyPart.preliminary = anyOptions.preliminary;
      if (options.title !== undefined) anyPart.title = options.title;
      anyPart.providerExecuted = anyOptions.providerExecuted ?? anyPart.providerExecuted;
      if (anyOptions.providerMetadata != null) {
        if (options.state === "output-available" || options.state === "output-error") {
          anyPart.resultProviderMetadata = anyOptions.providerMetadata;
        } else {
          anyPart.callProviderMetadata = anyOptions.providerMetadata;
        }
      }
    } else {
      this.message.parts.push({
        type: `tool-${anyOptions.toolName}`,
        toolCallId: anyOptions.toolCallId,
        state: anyOptions.state,
        title: anyOptions.title,
        input: anyOptions.input,
        output: anyOptions.output,
        rawInput: anyOptions.rawInput,
        errorText: anyOptions.errorText,
        providerExecuted: anyOptions.providerExecuted,
        preliminary: anyOptions.preliminary,
        ...(anyOptions.providerMetadata != null &&
        (anyOptions.state === "output-available" || anyOptions.state === "output-error")
          ? { resultProviderMetadata: anyOptions.providerMetadata }
          : {}),
        ...(anyOptions.providerMetadata != null &&
        !(anyOptions.state === "output-available" || anyOptions.state === "output-error")
          ? { callProviderMetadata: anyOptions.providerMetadata }
          : {}),
      } as M["parts"][number]);
    }
  }

  private updateDynamicToolPart(options: Record<string, unknown>) {
    const part = this.message.parts.find(
      (p) => p.type === "dynamic-tool" && p.toolCallId === options.toolCallId,
    );

    const anyOptions = options as any;

    if (part != null) {
      const anyPart = part as any;
      anyPart.state = options.state;
      anyPart.toolName = options.toolName;
      anyPart.input = anyOptions.input;
      anyPart.output = anyOptions.output;
      anyPart.errorText = anyOptions.errorText;
      anyPart.rawInput = anyOptions.rawInput ?? anyPart.rawInput;
      anyPart.preliminary = anyOptions.preliminary;
      if (options.title !== undefined) anyPart.title = options.title;
      anyPart.providerExecuted = anyOptions.providerExecuted ?? anyPart.providerExecuted;
      if (anyOptions.providerMetadata != null) {
        if (options.state === "output-available" || options.state === "output-error") {
          anyPart.resultProviderMetadata = anyOptions.providerMetadata;
        } else {
          anyPart.callProviderMetadata = anyOptions.providerMetadata;
        }
      }
    } else {
      this.message.parts.push({
        type: "dynamic-tool",
        toolName: anyOptions.toolName,
        toolCallId: anyOptions.toolCallId,
        state: anyOptions.state,
        input: anyOptions.input,
        output: anyOptions.output,
        errorText: anyOptions.errorText,
        preliminary: anyOptions.preliminary,
        providerExecuted: anyOptions.providerExecuted,
        title: anyOptions.title,
        ...(anyOptions.providerMetadata != null &&
        (anyOptions.state === "output-available" || anyOptions.state === "output-error")
          ? { resultProviderMetadata: anyOptions.providerMetadata }
          : {}),
        ...(anyOptions.providerMetadata != null &&
        !(anyOptions.state === "output-available" || anyOptions.state === "output-error")
          ? { callProviderMetadata: anyOptions.providerMetadata }
          : {}),
      } as M["parts"][number]);
    }
  }

  private flush() {
    if (this.messageIndex < 0) return;
    this.state.replaceMessage(this.messageIndex, this.message);
  }
}
