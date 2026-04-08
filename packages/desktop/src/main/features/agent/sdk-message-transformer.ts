import type { SDKMessage, SDKPartialAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  BetaRawContentBlockDeltaEvent,
  BetaRawContentBlockStartEvent,
  BetaRawContentBlockStopEvent,
  BetaRawMessageStartEvent,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";

import { createUIMessageStream, readUIMessageStream } from "ai";

import type {
  ClaudeCodeUIMessage,
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

type SDKMessageTransformerOptions = {
  rootParentToolUseId?: string | null;
  rootToolPrompt?: string | null;
};

type ParentToolState = {
  toolName: "Task" | "Agent";
  prompt?: string;
  childMessages: SDKMessage[];
  latestMessage?: ClaudeCodeUIMessage;
};

function isTaskOrAgentTool(toolName: string): toolName is "Task" | "Agent" {
  return toolName === "Task" || toolName === "Agent";
}

export class SDKMessageTransformer {
  private inStep = false;
  private hasStarted = false;
  private currentMessageId: string | null = null;
  private activeStreamedMessageId: string | null = null;
  private currentParentToolUseId: string | null = null;
  private currentStreamHasUnsupportedBlocks = false;
  private readonly completedStreamedAssistantMessageIds = new Set<string>();
  // Narrow dedupe state for Agent kickoff prompts only.
  // We intentionally do not scan prior messages or do fuzzy matching here.
  private readonly agentToolPrompts = new Map<string, string>();
  private readonly contentBlocks = new Map<number, ActiveContentBlock>();
  private readonly activeParentTools = new Map<string, ParentToolState>();
  private readonly readToolCallIds = new Set<string>();
  private readonly rootParentToolUseId: string | null;
  private readonly rootToolPrompt: string | null;

  constructor(options?: SDKMessageTransformerOptions) {
    this.rootParentToolUseId = options?.rootParentToolUseId ?? null;
    this.rootToolPrompt = options?.rootToolPrompt ?? null;
  }

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
          this.agentToolPrompts.clear();
          this.activeParentTools.clear();
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
        if (this.isTopLevelParent(msg.parent_tool_use_id)) {
          const isNewStep = msg.message.id !== this.currentMessageId;
          if (isNewStep) {
            if (this.inStep) yield { type: "finish-step" };
            yield { type: "start-step" };
            this.inStep = true;
            this.currentMessageId = msg.message.id;
          }
        }
        yield* this.transformAssistant(msg);
        break;
      }

      case "user": {
        // Skip synthetic messages injected by the SDK (e.g. skill prompt expansions)
        if ("isSynthetic" in msg && msg.isSynthetic) break;
        yield* this.transformUser(msg);
        break;
      }

      case "stream_event": {
        yield* this.transformStreamEvent(msg);
        break;
      }

      case "result": {
        if (this.inStep) yield { type: "finish-step" };

        // aborted_streaming: user sent a new message while the previous turn was still
        // streaming — the SDK aborts the in-flight response. This is expected, not an error.
        const isSuppressed =
          msg.subtype === "error_during_execution" && msg.terminal_reason === "aborted_streaming";
        const isError = msg.subtype !== "success" && !isSuppressed;

        if (isError) {
          yield {
            type: "error",
            errorText: msg.errors.join("\n") || `An unexpected error occurred (${msg.subtype})`,
          };
        }

        yield { type: `data-result/${msg.subtype}`, data: msg } as ClaudeCodeUIMessageChunk;
        yield { type: "finish" };

        this.inStep = false;
        this.currentMessageId = null;
        this.activeStreamedMessageId = null;
        this.currentParentToolUseId = null;
        this.currentStreamHasUnsupportedBlocks = false;
        this.agentToolPrompts.clear();
        this.contentBlocks.clear();
        this.activeParentTools.clear();
        break;
      }
    }
  }

  async *transformWithAggregation(msg: SDKMessage): AsyncGenerator<ClaudeCodeUIMessageChunk> {
    const parentToolUseId = "parent_tool_use_id" in msg ? msg.parent_tool_use_id : null;

    if (parentToolUseId != null && this.activeParentTools.has(parentToolUseId)) {
      yield* this.handleChildMessage(parentToolUseId, msg);
      return;
    }

    const parentToolResults = this.parentToolResultsForMessage(msg);
    for (const chunk of this.transform(msg)) {
      if (chunk.type === "tool-input-available" && isTaskOrAgentTool(chunk.toolName)) {
        this.activeParentTools.set(chunk.toolCallId, {
          toolName: chunk.toolName,
          prompt: this.extractToolPrompt(chunk.input),
          childMessages: [],
        });
        yield chunk;
        continue;
      }

      if (
        (chunk.type === "tool-output-available" || chunk.type === "tool-output-error") &&
        parentToolResults.has(chunk.toolCallId)
      ) {
        const state = this.activeParentTools.get(chunk.toolCallId);
        const toolResult = parentToolResults.get(chunk.toolCallId);
        if (state == null || toolResult == null) {
          yield chunk;
          continue;
        }

        if (toolResult.is_error) {
          yield {
            type: "tool-output-error",
            toolCallId: chunk.toolCallId,
            errorText: this.resultContentToText(toolResult.content, true),
            providerExecuted: true,
          };
        } else {
          state.latestMessage = this.finalizeAgentMessage({
            toolCallId: chunk.toolCallId,
            sessionId: msg.session_id ?? "",
            baseMessage: state.latestMessage,
            result: toolResult.content,
            isError: false,
          });

          yield {
            type: "tool-output-available",
            toolCallId: chunk.toolCallId,
            output: state.latestMessage,
            providerExecuted: true,
            preliminary: false,
          };
        }
        this.activeParentTools.delete(chunk.toolCallId);
        continue;
      }

      yield chunk;
    }
  }

  private async *handleChildMessage(
    parentToolUseId: string,
    msg: SDKMessage,
  ): AsyncGenerator<ClaudeCodeUIMessageChunk> {
    const state = this.activeParentTools.get(parentToolUseId);
    if (state == null) {
      return;
    }

    state.childMessages.push(msg);
    state.latestMessage = await materializeSDKMessagesToUIMessage(state.childMessages, {
      transformer: new SDKMessageTransformer({
        rootParentToolUseId: parentToolUseId,
        rootToolPrompt: state.prompt ?? null,
      }),
    });

    if (state.latestMessage == null) {
      return;
    }

    yield {
      type: "tool-output-available",
      toolCallId: parentToolUseId,
      output: state.latestMessage,
      providerExecuted: true,
      preliminary: true,
    };
  }

  private parentToolResultsForMessage(msg: SDKMessage) {
    const parentToolResults = new Map<string, { content: unknown; is_error: boolean }>();

    if (msg.type !== "user" || !Array.isArray(msg.message.content)) {
      return parentToolResults;
    }

    for (const part of msg.message.content) {
      if (part.type !== "tool_result") continue;
      if (!this.activeParentTools.has(part.tool_use_id)) continue;
      parentToolResults.set(part.tool_use_id, {
        content: part.content,
        is_error: part.is_error === true,
      });
    }

    return parentToolResults;
  }

  private extractToolPrompt(input: unknown) {
    if (
      input != null &&
      typeof input === "object" &&
      "prompt" in input &&
      typeof input.prompt === "string"
    ) {
      return input.prompt;
    }

    return undefined;
  }

  private *transformStreamEvent(
    msg: SDKPartialAssistantMessage,
  ): Generator<ClaudeCodeUIMessageChunk> {
    switch (msg.event.type) {
      case "message_start": {
        yield* this.handleMessageStart(msg, msg.event as BetaRawMessageStartEvent);
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
          sessionId: msg.session_id ?? "",
          parentToolUseId: this.isTopLevelParent(msg.parent_tool_use_id)
            ? null
            : msg.parent_tool_use_id,
        },
      };
    }

    const isNewStep = event.message.id !== this.currentMessageId;
    if (isNewStep && this.isTopLevelParent(msg.parent_tool_use_id)) {
      if (this.inStep) {
        yield { type: "finish-step" };
      }
      yield { type: "start-step" };
      this.inStep = true;
      this.currentMessageId = event.message.id;
      this.contentBlocks.clear();
    }

    this.currentParentToolUseId = this.isTopLevelParent(msg.parent_tool_use_id)
      ? null
      : msg.parent_tool_use_id;
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
          const parsedInput = JSON.parse(finalInput);
          this.rememberAgentToolPrompt(contentBlock.toolCallId, contentBlock.toolName, parsedInput);
          if (contentBlock.toolName === "Read") this.readToolCallIds.add(contentBlock.toolCallId);
          yield {
            type: "tool-input-available",
            toolCallId: contentBlock.toolCallId,
            toolName: contentBlock.toolName,
            input: parsedInput,
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
          this.rememberAgentToolPrompt(part.id, part.name, part.input);
          if (part.name === "Read") this.readToolCallIds.add(part.id);
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
      if (this.shouldSkipNestedPromptText(msg.parent_tool_use_id, content)) {
        return;
      }
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
              output: this.readToolCallIds.has(part.tool_use_id)
                ? this.parseReadToolContent(part.content)
                : part.content,
              providerExecuted: true,
            };
          }
          break;
        }
        case "text": {
          if (this.shouldSkipNestedPromptText(msg.parent_tool_use_id, part.text)) {
            break;
          }
          yield { type: "text-start", id: message.uuid };
          yield { type: "text-delta", id: message.uuid, delta: part.text };
          yield { type: "text-end", id: message.uuid };
          break;
        }
      }
    }
  }

  private claudeCodeMetadata(parentToolUseId: string | null | undefined) {
    return this.isTopLevelParent(parentToolUseId) ? undefined : { claudeCode: { parentToolUseId } };
  }

  // Claude Code emits both:
  // 1. the Agent tool input.prompt
  // 2. a subagent user text message with the same content
  //
  // Keep the fix narrow: cache only Agent prompts by toolCallId, then do a
  // single exact-string lookup when a child user message already points to that
  // tool via parent_tool_use_id. No history scans, no normalization, no fuzzy match.
  private rememberAgentToolPrompt(toolCallId: string, toolName: string, input: unknown) {
    if (toolName !== "Agent") {
      return;
    }

    const prompt =
      input != null && typeof input === "object" && "prompt" in input ? input.prompt : undefined;
    if (typeof prompt !== "string" || prompt.length === 0) {
      return;
    }

    this.agentToolPrompts.set(toolCallId, prompt);
  }

  private shouldSkipNestedPromptText(
    parentToolUseId: string | null | undefined,
    text: string | undefined,
  ) {
    if (parentToolUseId == null || typeof text !== "string") {
      return false;
    }

    if (parentToolUseId === this.rootParentToolUseId && this.rootToolPrompt === text) {
      return true;
    }

    const prompt = this.agentToolPrompts.get(parentToolUseId);
    return prompt != null && prompt === text;
  }

  private isTopLevelParent(parentToolUseId: string | null | undefined) {
    return parentToolUseId == null || parentToolUseId === this.rootParentToolUseId;
  }

  private finalizeAgentMessage({
    toolCallId,
    sessionId,
    baseMessage,
    result,
    isError,
  }: {
    toolCallId: string;
    sessionId: string;
    baseMessage?: ClaudeCodeUIMessage;
    result: unknown;
    isError: boolean;
  }): ClaudeCodeUIMessage {
    const parts = [
      ...(baseMessage?.parts ?? []),
      ...this.resultContentToMessageParts(result, isError),
    ];

    return {
      id: `agent:${toolCallId}`,
      role: "assistant",
      metadata: {
        sessionId,
        parentToolUseId: null,
      },
      parts,
    } as ClaudeCodeUIMessage;
  }

  private resultContentToMessageParts(result: unknown, isError: boolean) {
    const parts: ClaudeCodeUIMessage["parts"] = [];

    // Handle image outputs
    const imageParts = this.extractImageParts(result);
    for (const imagePart of imageParts) {
      parts.push(imagePart);
    }

    // Handle text outputs
    const texts = this.resultContentToTexts(result, isError);
    for (const text of texts) {
      parts.push({
        type: "text" as const,
        text,
        state: "done" as const,
      });
    }

    return parts;
  }

  private parseReadToolContent(content: unknown) {
    if (typeof content === "string") return { text: content, images: [] };
    if (!Array.isArray(content))
      return { text: content != null ? JSON.stringify(content) : "", images: [] };

    const texts: string[] = [];
    const images: { url: string; mediaType: string; filename?: string }[] = [];
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string") {
        texts.push(block.text);
      } else if (block?.type === "image" && block.source) {
        const src = block.source as {
          type: string;
          media_type?: string;
          data?: string;
          url?: string;
        };
        if (src.type === "base64" && src.data) {
          images.push({
            url: `data:${src.media_type || "image/png"};base64,${src.data}`,
            mediaType: src.media_type || "image/png",
            filename: block.filename,
          });
        } else if (src.type === "url" && src.url) {
          images.push({
            url: src.url,
            mediaType: src.media_type || "image/png",
            filename: block.filename,
          });
        }
      }
    }
    return { text: texts.join("\n"), images };
  }

  private extractImageParts(result: unknown): ClaudeCodeUIMessage["parts"] {
    const { images } = this.parseReadToolContent(result);
    return images.map((img) => ({
      type: "file" as const,
      mediaType: img.mediaType,
      url: img.url,
      filename: img.filename,
    }));
  }

  private resultContentToText(result: unknown, isError: boolean) {
    return this.resultContentToTexts(result, isError).join("\n");
  }

  private resultContentToTexts(result: unknown, isError: boolean) {
    const texts: string[] = [];

    if (typeof result === "string") {
      texts.push(result);
    } else if (Array.isArray(result)) {
      for (const part of result) {
        if (
          part != null &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          texts.push(part.text);
        }
      }
    } else if (
      result != null &&
      typeof result === "object" &&
      "result" in result &&
      typeof result.result === "string"
    ) {
      texts.push(result.result);
    } else if (result != null) {
      texts.push(JSON.stringify(result));
    }

    return texts.length === 0 ? [isError ? "Task failed" : "Task completed"] : texts;
  }

  // AI SDK only requires a stable per-part id so start/delta/end can be merged.
  // Anthropic's provider can use the raw content block index because it streams a
  // single model response at a time. We replay many assistant messages through one
  // UI stream, so the block index alone would collide across messages.
  private textPartId(messageId: string, index: number) {
    return `text:${messageId}:${index}`;
  }

  private reasoningPartId(messageId: string, index: number) {
    return `reasoning:${messageId}:${index}`;
  }
}

export async function materializeSDKMessagesToUIMessage(
  messages: Iterable<SDKMessage> | AsyncIterable<SDKMessage>,
  options?: {
    transformer?: SDKMessageTransformer;
  },
): Promise<ClaudeCodeUIMessage | undefined> {
  const transformer = options?.transformer ?? new SDKMessageTransformer();

  const stream = createUIMessageStream<ClaudeCodeUIMessage>({
    async execute({ writer }) {
      for await (const message of messages) {
        for await (const chunk of transformer.transformWithAggregation(message)) {
          writer.write(chunk);
        }
      }
    },
  });

  let last: ClaudeCodeUIMessage | undefined;
  for await (const message of readUIMessageStream<ClaudeCodeUIMessage>({ stream })) {
    last = message;
  }

  return last;
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
      const subtype = (msg as { subtype: string }).subtype;
      if (
        subtype === "init" ||
        subtype === "compact_boundary" ||
        subtype === "session_state_changed"
      )
        return null;
      return {
        kind: "event",
        event: { id: (msg as any).uuid ?? crypto.randomUUID(), ...msg },
      } as ClaudeCodeUIEvent;
    }
    default:
      return null;
  }
}
