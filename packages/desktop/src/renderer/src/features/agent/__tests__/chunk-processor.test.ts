/**
 * Tests for ChunkProcessor — 1:1 parity with AI SDK's processUIMessageStream.
 * Uses UIMessage / UIMessageChunk base types, no coupling to ClaudeCode-specific types.
 * Follows AI SDK test patterns: process chunks, check final message state with toEqual.
 */
import type { UIMessage, UIMessageChunk } from "ai";

import { describe, it, expect, beforeEach } from "vitest";

import { ChunkProcessor, type ChunkProcessorState } from "../chunk-processor";

// ── Mock ChatState ──────────────────────────────────────────────────────────

class MockChatState implements ChunkProcessorState<UIMessage> {
  messages: UIMessage[] = [];
  status: string = "ready";
  error: Error | undefined = undefined;

  pushMessage(msg: UIMessage) {
    this.messages.push(structuredClone(msg));
  }

  replaceMessage(index: number, msg: UIMessage) {
    this.messages[index] = structuredClone(msg);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function processAll(
  processor: ChunkProcessor<UIMessage>,
  chunks: UIMessageChunk[],
): Promise<UIMessage> {
  for (const chunk of chunks) {
    await processor.processChunk(chunk);
  }
  return processor["state"].messages[0];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ChunkProcessor", () => {
  let state: MockChatState;
  let processor: ChunkProcessor<UIMessage>;

  beforeEach(() => {
    state = new MockChatState();
    processor = new ChunkProcessor(state);
  });

  // ── text ─────────────────────────────────────────────────────────────────

  it("text: correct final message state", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Hello, " },
      { type: "text-delta", id: "text-1", delta: "world!" },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    expect(msg.id).toBe("msg-123");
    expect(msg.role).toBe("assistant");
    expect(msg.parts).toEqual([
      { type: "step-start" },
      { providerMetadata: undefined, state: "done", text: "Hello, world!", type: "text" },
    ]);
  });

  // ── server-side tool roundtrip ────────────────────────────────────────────

  it("server-side tool roundtrip: correct final message state", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "tool-name",
        input: { city: "London" },
      },
      { type: "tool-output-available", toolCallId: "tc-1", output: { weather: "sunny" } },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "The weather in London is sunny." },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    expect(msg.parts).toEqual([
      { type: "step-start" },
      {
        errorText: undefined,
        input: { city: "London" },
        output: { weather: "sunny" },
        preliminary: undefined,
        providerExecuted: undefined,
        rawInput: undefined,
        state: "output-available",
        title: undefined,
        toolCallId: "tc-1",
        type: "tool-tool-name",
      },
      { type: "step-start" },
      {
        providerMetadata: undefined,
        state: "done",
        text: "The weather in London is sunny.",
        type: "text",
      },
    ]);
  });

  // ── tool call streaming ───────────────────────────────────────────────────

  it("tool call streaming: input-streaming → input-available → output-available", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      { type: "tool-input-start", toolCallId: "tc-1", toolName: "Bash" },
      { type: "tool-input-delta", toolCallId: "tc-1", inputTextDelta: '{"com' },
      { type: "tool-input-delta", toolCallId: "tc-1", inputTextDelta: 'mand":"ls"}' },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "Bash",
        input: { command: "ls" },
      },
      { type: "tool-output-available", toolCallId: "tc-1", output: "file.txt" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    expect(msg.parts).toEqual([
      { type: "step-start" },
      {
        errorText: undefined,
        input: { command: "ls" },
        output: "file.txt",
        preliminary: undefined,
        providerExecuted: undefined,
        rawInput: undefined,
        state: "output-available",
        title: undefined,
        toolCallId: "tc-1",
        type: "tool-Bash",
      },
    ]);
  });

  // ── reasoning ─────────────────────────────────────────────────────────────

  it("reasoning: correct final message state with providerMetadata", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      { type: "reasoning-start", id: "r-1", providerMetadata: { anthropic: { signature: "sig" } } },
      { type: "reasoning-delta", id: "r-1", delta: "thinking..." },
      { type: "reasoning-end", id: "r-1" },
      { type: "text-start", id: "t-1" },
      { type: "text-delta", id: "t-1", delta: "answer" },
      { type: "text-end", id: "t-1" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    expect(msg.parts).toEqual([
      { type: "step-start" },
      {
        type: "reasoning",
        text: "thinking...",
        state: "done",
        providerMetadata: { anthropic: { signature: "sig" } },
      },
      { type: "text", text: "answer", state: "done", providerMetadata: undefined },
    ]);
  });

  // ── data parts ────────────────────────────────────────────────────────────

  it("data parts: single part", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "data-system/init", id: "d-1", data: { session_id: "s-1" } },
      { type: "finish" },
    ]);

    expect(msg.parts).toEqual([
      { type: "data-system/init", id: "d-1", data: { session_id: "s-1" } },
    ]);
  });

  it("data parts: replacement update by type+id", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "data-result/info", id: "d-1", data: "first" },
      { type: "data-result/info", id: "d-1", data: "second" },
      { type: "finish" },
    ]);

    expect(msg.parts).toHaveLength(1);
    expect((msg.parts[0] as { data: unknown }).data).toBe("second");
  });

  // ── tool-input-error ──────────────────────────────────────────────────────

  it("tool-input-error: produces output-error with rawInput", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      { type: "tool-input-start", toolCallId: "tc-1", toolName: "Bash" },
      {
        type: "tool-input-error",
        toolCallId: "tc-1",
        toolName: "Bash",
        errorText: "parse failed",
        input: { raw: true },
      },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    const toolPart = msg.parts.find((p) => p.type === "tool-Bash") as Record<string, unknown>;
    expect(toolPart.state).toBe("output-error");
    expect(toolPart.errorText).toBe("parse failed");
    expect(toolPart.rawInput).toEqual({ raw: true });
  });

  // ── tool-output-error ─────────────────────────────────────────────────────

  it("tool-output-error: produces output-error with errorText", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "Read",
        input: { file: "a.ts" },
      },
      { type: "tool-output-error", toolCallId: "tc-1", errorText: "execution failed" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    const toolPart = msg.parts.find((p) => p.type === "tool-Read") as Record<string, unknown>;
    expect(toolPart.state).toBe("output-error");
    expect(toolPart.errorText).toBe("execution failed");
  });

  // ── error chunk ───────────────────────────────────────────────────────────

  it("error chunk: sets state.error and status", async () => {
    await processor.processChunk({ type: "start", messageId: "msg-1" });
    await processor.processChunk({ type: "error", errorText: "something failed" });

    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe("something failed");
    expect(state.status).toBe("error");
  });

  // ── resetTurn ─────────────────────────────────────────────────────────────

  it("resetTurn: second turn starts fresh", async () => {
    // Turn 1
    await processAll(processor, [
      { type: "start", messageId: "msg-1" },
      { type: "text-start", id: "t-1" },
      { type: "text-delta", id: "t-1", delta: "Hello" },
      { type: "text-end", id: "t-1" },
      { type: "finish" },
    ]);

    expect(state.messages).toHaveLength(1);

    // Turn 2
    processor.resetTurn();
    await processAll(processor, [
      { type: "start", messageId: "msg-2" },
      { type: "text-start", id: "t-2" },
      { type: "text-delta", id: "t-2", delta: "World" },
      { type: "text-end", id: "t-2" },
      { type: "finish" },
    ]);

    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].id).toBe("msg-2");
  });

  // ── no-op chunks ──────────────────────────────────────────────────────────

  it("start-step adds step-start part (visible after next flush)", async () => {
    // AI SDK: start-step pushes a step-start part but does NOT write/flush.
    // The part becomes visible in state after the next chunk that flushes.
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-1" },
      { type: "start-step" },
      { type: "text-start", id: "t-1" },
      { type: "text-delta", id: "t-1", delta: "hi" },
      { type: "text-end", id: "t-1" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    // step-start is the first part, text follows
    expect(msg.parts[0]).toEqual({ type: "step-start" });
    expect((msg.parts[1] as Record<string, unknown>).text).toBe("hi");
  });

  // ── message metadata merging ──────────────────────────────────────────────

  it("message metadata: start and finish metadata are deep merged", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123", messageMetadata: { key1: "value-1" } },
      { type: "finish", messageMetadata: { key2: "value-2" } },
    ]);

    expect(msg.metadata).toEqual({ key1: "value-1", key2: "value-2" });
  });

  // ── preliminary tool output ───────────────────────────────────────────────

  it("preliminary tool output: preliminary flag progression", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "Agent",
        input: { prompt: "do X" },
      },
      {
        type: "tool-output-available",
        toolCallId: "tc-1",
        output: "partial...",
        preliminary: true,
      },
      { type: "tool-output-available", toolCallId: "tc-1", output: "final result" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    const toolPart = msg.parts.find((p) => p.type === "tool-Agent") as Record<string, unknown>;
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output).toBe("final result");
    expect(toolPart.preliminary).toBeUndefined();
  });

  // ── provider metadata on tool calls ───────────────────────────────────────

  it("provider metadata: callProviderMetadata on input-available", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "Read",
        input: {},
        providerMetadata: { key: "val" } as any,
      },
      { type: "tool-output-available", toolCallId: "tc-1", output: "ok" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    const toolPart = msg.parts.find((p) => p.type === "tool-Read") as Record<string, unknown>;
    expect(toolPart.callProviderMetadata).toEqual({ key: "val" });
  });

  // ── dynamic tools ─────────────────────────────────────────────────────────

  it("dynamic tools: full lifecycle", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "dynamic-tool",
        input: { x: 1 },
        dynamic: true,
      },
      { type: "tool-output-available", toolCallId: "tc-1", output: "result" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    const toolPart = msg.parts.find((p) => p.type === "dynamic-tool") as Record<string, unknown>;
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output).toBe("result");
    expect(toolPart.toolCallId).toBe("tc-1");
  });

  // ── tool approval requests ────────────────────────────────────────────────

  // tool-approval-request is in AI SDK source head but not in ai@6.0.x UIMessageChunk union.
  // readUIMessageStream silently ignores unknown chunk types.
  it.skip("tool approval: sets approval-requested state", async () => {
    await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: "tc-1", toolName: "Bash", input: {} },
      { type: "tool-approval-request", toolCallId: "tc-1", approvalId: "approval-1" },
    ]);

    const toolPart = state.messages[0].parts.find((p) => p.type === "tool-Bash") as Record<
      string,
      unknown
    >;
    expect(toolPart.state).toBe("approval-requested");
    expect(toolPart.approval).toEqual({ id: "approval-1" });
  });

  // ── multi-step with multiple texts ────────────────────────────────────────

  it("multi-step: text + tool + text across steps", async () => {
    const msg = await processAll(processor, [
      { type: "start", messageId: "msg-123" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "I will use a tool." },
      { type: "text-end", id: "text-1" },
      {
        type: "tool-input-available",
        toolCallId: "tc-1",
        toolName: "tool-name",
        input: { city: "London" },
      },
      { type: "tool-output-available", toolCallId: "tc-1", output: { weather: "sunny" } },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "text-start", id: "text-2" },
      { type: "text-delta", id: "text-2", delta: "The weather is sunny." },
      { type: "text-end", id: "text-2" },
      { type: "finish-step" },
      { type: "finish" },
    ]);

    expect(msg.parts).toEqual([
      { type: "step-start" },
      { type: "text", text: "I will use a tool.", state: "done", providerMetadata: undefined },
      {
        type: "tool-tool-name",
        toolCallId: "tc-1",
        state: "output-available",
        input: { city: "London" },
        output: { weather: "sunny" },
        errorText: undefined,
        rawInput: undefined,
        preliminary: undefined,
        providerExecuted: undefined,
        title: undefined,
      },
      { type: "step-start" },
      { type: "text", text: "The weather is sunny.", state: "done", providerMetadata: undefined },
    ]);
  });
});
