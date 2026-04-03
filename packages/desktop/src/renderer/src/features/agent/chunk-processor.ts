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

// ai/src/ui-message-stream/ui-message-chunks.ts (not exported from ai package)
function isDataUIMessageChunk(chunk: UIMessageChunk): chunk is UIMessageChunk & {
  type: `data-${string}`;
  id?: string;
  data: unknown;
  transient?: boolean;
} {
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
    { text: string; index: number; toolName: string; dynamic?: boolean; title?: string }
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
    // The AI SDK source uses fully-typed chunk narrowing. We cast to `any` because:
    // 1. Some chunk types (custom, reasoning-file) aren't in the published union yet
    // 2. Some fields (providerMetadata on tool-output-*) aren't in the published types yet
    // This preserves 1:1 structural parity with the AI SDK switch statement.
    const c = chunk as any;

    switch (c.type) {
      case "text-start": {
        const textPart = {
          type: "text" as const,
          text: "",
          providerMetadata: c.providerMetadata,
          state: "streaming" as const,
        };
        this.activeTextParts[c.id] = textPart as M["parts"][number];
        this.message.parts.push(textPart as M["parts"][number]);
        this.flush();
        break;
      }

      case "text-delta": {
        const textPart = this.activeTextParts[c.id];
        // Adaptation: AI SDK throws UIMessageStreamError on missing part.
        // We silently skip for long-lived connection robustness.
        if (textPart == null) break;
        (textPart as any).text += c.delta;
        (textPart as any).providerMetadata =
          c.providerMetadata ?? (textPart as any).providerMetadata;
        this.flush();
        break;
      }

      case "text-end": {
        const textPart = this.activeTextParts[c.id];
        if (textPart == null) break;
        (textPart as any).state = "done";
        (textPart as any).providerMetadata =
          c.providerMetadata ?? (textPart as any).providerMetadata;
        delete this.activeTextParts[c.id];
        this.flush();
        break;
      }

      case "custom": {
        this.message.parts.push({
          type: "custom",
          kind: c.kind,
          providerMetadata: c.providerMetadata,
        } as unknown as M["parts"][number]);
        this.flush();
        break;
      }

      case "reasoning-start": {
        const reasoningPart = {
          type: "reasoning" as const,
          text: "",
          providerMetadata: c.providerMetadata,
          state: "streaming" as const,
        };
        this.activeReasoningParts[c.id] = reasoningPart as M["parts"][number];
        this.message.parts.push(reasoningPart as M["parts"][number]);
        this.flush();
        break;
      }

      case "reasoning-delta": {
        const reasoningPart = this.activeReasoningParts[c.id];
        if (reasoningPart == null) break;
        (reasoningPart as any).text += c.delta;
        (reasoningPart as any).providerMetadata =
          c.providerMetadata ?? (reasoningPart as any).providerMetadata;
        this.flush();
        break;
      }

      case "reasoning-end": {
        const reasoningPart = this.activeReasoningParts[c.id];
        if (reasoningPart == null) break;
        (reasoningPart as any).providerMetadata =
          c.providerMetadata ?? (reasoningPart as any).providerMetadata;
        (reasoningPart as any).state = "done";
        delete this.activeReasoningParts[c.id];

        this.flush();
        break;
      }

      case "file":
      case "reasoning-file": {
        this.message.parts.push({
          type: c.type,
          mediaType: c.mediaType,
          url: c.url,
          ...(c.providerMetadata != null ? { providerMetadata: c.providerMetadata } : {}),
        } as unknown as M["parts"][number]);

        this.flush();
        break;
      }

      case "source-url": {
        this.message.parts.push({
          type: "source-url",
          sourceId: c.sourceId,
          url: c.url,
          title: c.title,
          providerMetadata: c.providerMetadata,
        } as M["parts"][number]);

        this.flush();
        break;
      }

      case "source-document": {
        this.message.parts.push({
          type: "source-document",
          sourceId: c.sourceId,
          mediaType: c.mediaType,
          title: c.title,
          filename: c.filename,
          providerMetadata: c.providerMetadata,
        } as M["parts"][number]);

        this.flush();
        break;
      }

      case "tool-input-start": {
        const toolInvocations = this.message.parts.filter(isStaticToolUIPart);

        // add the partial tool call to the map
        this.partialToolCalls[c.toolCallId] = {
          text: "",
          toolName: c.toolName,
          index: toolInvocations.length,
          dynamic: c.dynamic,
          title: c.title,
        };

        if (c.dynamic) {
          this.updateDynamicToolPart({
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "input-streaming",
            input: undefined,
            providerExecuted: c.providerExecuted,
            title: c.title,
            providerMetadata: c.providerMetadata,
          });
        } else {
          this.updateToolPart({
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
        const partialToolCall = this.partialToolCalls[c.toolCallId];
        // Adaptation: AI SDK throws UIMessageStreamError on missing partial tool call.
        // We silently skip for long-lived connection robustness.
        if (partialToolCall == null) break;

        partialToolCall.text += c.inputTextDelta;

        const { value: partialArgs } = await parsePartialJson(partialToolCall.text);

        if (partialToolCall.dynamic) {
          this.updateDynamicToolPart({
            toolCallId: c.toolCallId,
            toolName: partialToolCall.toolName,
            state: "input-streaming",
            input: partialArgs,
            title: partialToolCall.title,
          });
        } else {
          this.updateToolPart({
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
          this.updateDynamicToolPart({
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "input-available",
            input: c.input,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: c.title,
          });
        } else {
          this.updateToolPart({
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
        // When a part already exists for this toolCallId (e.g. from
        // tool-input-start), honour its type so we update in place
        // instead of creating a duplicate with a mismatched type.
        const existingPart = this.message.parts
          .filter(isToolUIPart)
          .find((p) => p.toolCallId === c.toolCallId);
        const isDynamic = existingPart != null ? existingPart.type === "dynamic-tool" : !!c.dynamic;

        if (isDynamic) {
          this.updateDynamicToolPart({
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "output-error",
            input: c.input,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
          });
        } else {
          this.updateToolPart({
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
        const toolInvocation = this.getToolInvocation(c.toolCallId);
        // Adaptation: AI SDK throws on missing tool invocation.
        // We silently skip for long-lived connection robustness.
        if (toolInvocation == null) break;
        (toolInvocation as any).state = "approval-requested";
        (toolInvocation as any).approval = { id: c.approvalId };
        this.flush();
        break;
      }

      case "tool-output-denied": {
        const toolInvocation = this.getToolInvocation(c.toolCallId);
        if (toolInvocation == null) break;
        (toolInvocation as any).state = "output-denied";
        this.flush();
        break;
      }

      case "tool-output-available": {
        const toolInvocation = this.getToolInvocation(c.toolCallId);
        if (toolInvocation == null) break;

        if (toolInvocation.type === "dynamic-tool") {
          this.updateDynamicToolPart({
            toolCallId: c.toolCallId,
            toolName: (toolInvocation as any).toolName,
            state: "output-available",
            input: (toolInvocation as any).input,
            output: c.output,
            preliminary: c.preliminary,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: (toolInvocation as any).title,
          });
        } else {
          this.updateToolPart({
            toolCallId: c.toolCallId,
            toolName: getStaticToolName(toolInvocation as any),
            state: "output-available",
            input: (toolInvocation as any).input,
            output: c.output,
            providerExecuted: c.providerExecuted,
            preliminary: c.preliminary,
            providerMetadata: c.providerMetadata,
            title: (toolInvocation as any).title,
          });
        }

        this.flush();
        break;
      }

      case "tool-output-error": {
        const toolInvocation = this.getToolInvocation(c.toolCallId);
        if (toolInvocation == null) break;

        if (toolInvocation.type === "dynamic-tool") {
          this.updateDynamicToolPart({
            toolCallId: c.toolCallId,
            toolName: (toolInvocation as any).toolName,
            state: "output-error",
            input: (toolInvocation as any).input,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: (toolInvocation as any).title,
          });
        } else {
          this.updateToolPart({
            toolCallId: c.toolCallId,
            toolName: getStaticToolName(toolInvocation as any),
            state: "output-error",
            input: (toolInvocation as any).input,
            rawInput: (toolInvocation as any).rawInput,
            errorText: c.errorText,
            providerExecuted: c.providerExecuted,
            providerMetadata: c.providerMetadata,
            title: (toolInvocation as any).title,
          });
        }

        this.flush();
        break;
      }

      case "start-step": {
        // add a step boundary part to the message
        this.message.parts.push({ type: "step-start" } as M["parts"][number]);
        break;
      }

      case "finish-step": {
        // reset the current text and reasoning parts
        this.activeTextParts = {};
        this.activeReasoningParts = {};
        break;
      }

      case "start": {
        if (c.messageId != null) {
          (this.message as { id: string }).id = c.messageId;
        }

        this.updateMessageMetadata(c.messageMetadata);

        // Adaptation: AI SDK's write() conditionally pushes or replaces via
        // activeResponse shadow state. We explicitly push on start since our
        // architecture requires the message in the array from the beginning.
        this.state.pushMessage(this.message);
        this.messageIndex = this.state.messages.length - 1;

        if (c.messageId != null || c.messageMetadata != null) {
          this.flush();
        }
        break;
      }

      case "finish": {
        if (c.finishReason != null) {
          this.finishReason = c.finishReason;
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

      case "error": {
        // Adaptation: AI SDK calls onError callback.
        // We set state.error and state.status directly.
        this.state.error = new Error(c.errorText);
        this.state.status = "error";
        break;
      }

      default: {
        if (isDataUIMessageChunk(c)) {
          const dataChunk = c;

          // transient parts are not added to the message state
          if (dataChunk.transient) break;

          const existingUIPart =
            dataChunk.id != null
              ? this.message.parts.find(
                  (chunkArg: any) =>
                    dataChunk.type === chunkArg.type && dataChunk.id === chunkArg.id,
                )
              : undefined;

          if (existingUIPart != null) {
            (existingUIPart as any).data = dataChunk.data;
          } else {
            this.message.parts.push(dataChunk as M["parts"][number]);
          }

          this.flush();
        }
      }
    }
  }

  // ── Private helpers (1:1 with AI SDK) ─────────────────────────

  // Adaptation: AI SDK throws UIMessageStreamError when tool invocation is not found.
  // We return undefined and callers silently skip — more robust for a long-lived
  // subscribe connection where an out-of-order chunk shouldn't crash the entire stream.
  private getToolInvocation(toolCallId: string): M["parts"][number] | undefined {
    return this.message.parts.filter(isToolUIPart).find((p) => p.toolCallId === toolCallId);
  }

  private updateToolPart(options: Record<string, unknown>) {
    const part = this.message.parts.find(
      (part) => isStaticToolUIPart(part) && part.toolCallId === options.toolCallId,
    );

    const anyOptions = options as any;
    const anyPart = part as any;

    if (part != null) {
      anyPart.state = options.state;
      anyPart.input = anyOptions.input;
      anyPart.output = anyOptions.output;
      anyPart.errorText = anyOptions.errorText;
      anyPart.rawInput = anyOptions.rawInput;
      anyPart.preliminary = anyOptions.preliminary;
      if (options.title !== undefined) {
        anyPart.title = options.title;
      }
      // once providerExecuted is set, it stays for streaming
      anyPart.providerExecuted = anyOptions.providerExecuted ?? anyPart.providerExecuted;

      const providerMetadata = anyOptions.providerMetadata;

      if (providerMetadata != null) {
        if (options.state === "output-available" || options.state === "output-error") {
          anyPart.resultProviderMetadata = providerMetadata;
        } else {
          anyPart.callProviderMetadata = providerMetadata;
        }
      }
    } else {
      this.message.parts.push({
        type: `tool-${options.toolName}`,
        toolCallId: options.toolCallId,
        state: options.state,
        title: options.title,
        input: anyOptions.input,
        output: anyOptions.output,
        rawInput: anyOptions.rawInput,
        errorText: anyOptions.errorText,
        providerExecuted: anyOptions.providerExecuted,
        preliminary: anyOptions.preliminary,
        ...(anyOptions.providerMetadata != null &&
        (options.state === "output-available" || options.state === "output-error")
          ? { resultProviderMetadata: anyOptions.providerMetadata }
          : {}),
        ...(anyOptions.providerMetadata != null &&
        !(options.state === "output-available" || options.state === "output-error")
          ? { callProviderMetadata: anyOptions.providerMetadata }
          : {}),
      } as M["parts"][number]);
    }
  }

  private updateDynamicToolPart(options: Record<string, unknown>) {
    const part = this.message.parts.find(
      (part) => part.type === "dynamic-tool" && part.toolCallId === options.toolCallId,
    );

    const anyOptions = options as any;
    const anyPart = part as any;

    if (part != null) {
      anyPart.state = options.state;
      anyPart.toolName = options.toolName;
      anyPart.input = anyOptions.input;
      anyPart.output = anyOptions.output;
      anyPart.errorText = anyOptions.errorText;
      anyPart.rawInput = anyOptions.rawInput ?? anyPart.rawInput;
      anyPart.preliminary = anyOptions.preliminary;
      if (options.title !== undefined) {
        anyPart.title = options.title;
      }
      // once providerExecuted is set, it stays for streaming
      anyPart.providerExecuted = anyOptions.providerExecuted ?? anyPart.providerExecuted;

      const providerMetadata = anyOptions.providerMetadata;

      if (providerMetadata != null) {
        if (options.state === "output-available" || options.state === "output-error") {
          anyPart.resultProviderMetadata = providerMetadata;
        } else {
          anyPart.callProviderMetadata = providerMetadata;
        }
      }
    } else {
      this.message.parts.push({
        type: "dynamic-tool",
        toolName: options.toolName,
        toolCallId: options.toolCallId,
        state: options.state,
        input: anyOptions.input,
        output: anyOptions.output,
        errorText: anyOptions.errorText,
        preliminary: anyOptions.preliminary,
        providerExecuted: anyOptions.providerExecuted,
        title: options.title,
        ...(anyOptions.providerMetadata != null &&
        (options.state === "output-available" || options.state === "output-error")
          ? { resultProviderMetadata: anyOptions.providerMetadata }
          : {}),
        ...(anyOptions.providerMetadata != null &&
        !(options.state === "output-available" || options.state === "output-error")
          ? { callProviderMetadata: anyOptions.providerMetadata }
          : {}),
      } as M["parts"][number]);
    }
  }

  private updateMessageMetadata(metadata: unknown) {
    if (metadata != null) {
      const mergedMetadata =
        this.message.metadata != null
          ? mergeObjects(this.message.metadata as object, metadata as object)
          : metadata;

      (this.message as { metadata: unknown }).metadata = mergedMetadata;
    }
  }

  private flush() {
    if (this.messageIndex < 0) return;
    this.state.replaceMessage(this.messageIndex, this.message);
  }
}
