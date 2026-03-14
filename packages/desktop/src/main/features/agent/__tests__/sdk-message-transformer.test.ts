import { createUIMessageStream, readUIMessageStream } from "ai";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach } from "vitest";

import { SDKMessageTransformer, toUIEvent } from "../sdk-message-transformer";

function collect(gen: Generator<any>): any[] {
  const out: any[] = [];
  for (const item of gen) out.push(item);
  return out;
}

function loadFixture(name: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as any[];
}

const makeAssistantMsg = (
  id: string,
  content: any[],
  options?: { uuid?: string; parentToolUseId?: string | null; sessionId?: string },
) => ({
  type: "assistant" as const,
  uuid: options?.uuid ?? "uuid-a",
  session_id: options?.sessionId ?? "sess-1",
  parent_tool_use_id: options?.parentToolUseId ?? null,
  error: null,
  message: {
    id,
    role: "assistant" as const,
    content,
    model: "claude-3",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message" as const,
    usage: { input_tokens: 10, output_tokens: 5 },
  },
});

const makeStreamEventMsg = (
  event: any,
  options?: { sessionId?: string; uuid?: string; parentToolUseId?: string | null },
) => ({
  type: "stream_event" as const,
  event,
  uuid: options?.uuid ?? "stream-uuid",
  session_id: options?.sessionId ?? "sess-1",
  parent_tool_use_id: options?.parentToolUseId ?? null,
});

const makeMessageStartEvent = (id: string) => ({
  type: "message_start" as const,
  message: {
    id,
    role: "assistant" as const,
    content: [],
    model: "claude-3",
    stop_reason: null,
    stop_sequence: null,
    type: "message" as const,
    usage: { input_tokens: 10, output_tokens: 0 },
  },
});

const makeTextBlockStartEvent = (index: number, text = "") => ({
  type: "content_block_start" as const,
  index,
  content_block: { type: "text" as const, text, citations: null },
});

const makeThinkingBlockStartEvent = (index: number, thinking = "", signature = "") => ({
  type: "content_block_start" as const,
  index,
  content_block: { type: "thinking" as const, thinking, signature },
});

const makeRedactedThinkingBlockStartEvent = (index: number, data: string) => ({
  type: "content_block_start" as const,
  index,
  content_block: { type: "redacted_thinking" as const, data },
});

const makeToolUseBlockStartEvent = (
  index: number,
  toolCallId: string,
  toolName: string,
  input: unknown = {},
) => ({
  type: "content_block_start" as const,
  index,
  content_block: { type: "tool_use" as const, id: toolCallId, name: toolName, input },
});

const makeTextDeltaEvent = (index: number, text: string) => ({
  type: "content_block_delta" as const,
  index,
  delta: { type: "text_delta" as const, text },
});

const makeThinkingDeltaEvent = (index: number, thinking: string) => ({
  type: "content_block_delta" as const,
  index,
  delta: { type: "thinking_delta" as const, thinking },
});

const makeSignatureDeltaEvent = (index: number, signature: string) => ({
  type: "content_block_delta" as const,
  index,
  delta: { type: "signature_delta" as const, signature },
});

const makeInputJsonDeltaEvent = (index: number, partialJson: string) => ({
  type: "content_block_delta" as const,
  index,
  delta: { type: "input_json_delta" as const, partial_json: partialJson },
});

const makeBlockStopEvent = (index: number) => ({
  type: "content_block_stop" as const,
  index,
});

const makeMessageStopEvent = () => ({
  type: "message_stop" as const,
});

const makeUserMsg = (
  content: any,
  options?: { uuid?: string; parentToolUseId?: string | null; sessionId?: string },
) => ({
  type: "user" as const,
  uuid: options?.uuid ?? "uuid-u",
  session_id: options?.sessionId ?? "sess-1",
  parent_tool_use_id: options?.parentToolUseId ?? null,
  message: {
    role: "user" as const,
    content,
  },
});

describe("SDKMessageTransformer", () => {
  let t: SDKMessageTransformer;
  beforeEach(() => {
    t = new SDKMessageTransformer();
  });

  it("system/init → start + data-system/init chunk", () => {
    const msg = {
      type: "system" as const,
      subtype: "init" as const,
      uuid: "uuid-1",
      session_id: "sess-1",
      model: "claude-3",
      tools: [],
      slash_commands: [],
      cwd: "/tmp",
      mcp_servers: [],
      api_key_source: "env",
    };
    const chunks = collect(t.transform(msg as any));
    expect(chunks[0]).toMatchObject({ type: "start", messageId: "uuid-1" });
    expect(chunks[0].messageMetadata).toEqual({ sessionId: "sess-1", parentToolUseId: null });
    expect(chunks[1].type).toBe("data-system/init");
  });

  it("assistant without prior system/init → start + start-step + text", () => {
    const chunks = collect(
      t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "Hello" }]) as any),
    );
    expect(chunks.map((c: any) => c.type)).toEqual([
      "start",
      "start-step",
      "text-start",
      "text-delta",
      "text-end",
    ]);
    expect(chunks[0]).toMatchObject({ type: "start", messageId: "msg-A" });
    expect(chunks.find((c: any) => c.type === "text-delta").delta).toBe("Hello");
  });

  it("assistant after system/init → no extra start", () => {
    const initMsg = {
      type: "system" as const,
      subtype: "init" as const,
      uuid: "uuid-1",
      session_id: "sess-1",
      model: "claude-3",
      tools: [],
      slash_commands: [],
      cwd: "/tmp",
      mcp_servers: [],
      api_key_source: "env",
    };
    collect(t.transform(initMsg as any));
    const chunks = collect(
      t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "Hello" }]) as any),
    );
    expect(chunks.map((c: any) => c.type)).toEqual([
      "start-step",
      "text-start",
      "text-delta",
      "text-end",
    ]);
  });

  it("same message.id does not emit start-step again", () => {
    collect(t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "Hello" }]) as any));
    const second = collect(
      t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: " World" }]) as any),
    );
    expect(second.map((c: any) => c.type)).not.toContain("start-step");
  });

  it("new message.id emits finish-step then start-step", () => {
    collect(t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "A" }]) as any));
    const second = collect(
      t.transform(makeAssistantMsg("msg-B", [{ type: "text", text: "B" }]) as any),
    );
    // no second "start" — already started
    expect(second.map((c: any) => c.type)).toEqual([
      "finish-step",
      "start-step",
      "text-start",
      "text-delta",
      "text-end",
    ]);
  });

  it("subagent assistant messages do not emit global step boundaries", () => {
    collect(t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "A" }]) as any));

    const chunks = collect(
      t.transform(
        makeAssistantMsg(
          "msg-child",
          [{ type: "tool_use", id: "call-child", name: "Glob", input: { pattern: "**/*" } }],
          { parentToolUseId: "call-agent" },
        ) as any,
      ),
    );

    expect(chunks).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "call-child",
        toolName: "Glob",
        input: { pattern: "**/*" },
        providerExecuted: true,
        providerMetadata: { claudeCode: { parentToolUseId: "call-agent" } },
      },
    ]);
  });

  it("result/success → finish-step + finish (no error chunk)", () => {
    collect(t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "hi" }]) as any));
    const chunks = collect(
      t.transform({
        type: "result" as const,
        subtype: "success" as const,
        uuid: "r",
        session_id: "s",
        is_error: false,
        num_turns: 1,
        duration_ms: 100,
        total_cost_usd: 0.001,
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
        errors: [],
      } as any),
    );
    const types = chunks.map((c: any) => c.type);
    expect(types).toContain("finish-step");
    expect(types).toContain("finish");
    expect(types).not.toContain("error");
  });

  it("result/error → finish-step + error + finish", () => {
    collect(t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "hi" }]) as any));
    const chunks = collect(
      t.transform({
        type: "result" as const,
        subtype: "error_max_turns" as const,
        uuid: "r",
        session_id: "s",
        is_error: true,
        num_turns: 5,
        duration_ms: 100,
        total_cost_usd: 0.001,
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "max_turns",
        errors: ["max turns reached"],
      } as any),
    );
    const types = chunks.map((c: any) => c.type);
    expect(types).toContain("finish-step");
    expect(types).toContain("error");
    expect(types).toContain("finish");
  });

  it("user tool_result → tool-output-available", () => {
    const msg = {
      type: "user" as const,
      uuid: "u",
      session_id: "s",
      parent_tool_use_id: "tool-id",
      message: {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-id",
            content: [{ type: "text", text: "ok" }],
            is_error: false,
          },
        ],
      },
    };
    const chunks = collect(t.transform(msg as any));
    expect(chunks[0]).toMatchObject({
      type: "tool-output-available",
      toolCallId: "tool-id",
      providerExecuted: true,
    });
  });

  it("user tool_result is_error → tool-output-error", () => {
    const msg = {
      type: "user" as const,
      uuid: "u",
      session_id: "s",
      parent_tool_use_id: "tool-id",
      message: {
        role: "user" as const,
        content: [{ type: "tool_result", tool_use_id: "tool-id", content: "fail", is_error: true }],
      },
    };
    const chunks = collect(t.transform(msg as any));
    expect(chunks[0]).toMatchObject({ type: "tool-output-error", toolCallId: "tool-id" });
  });

  it("assistant tool_use → tool-input-available", () => {
    const chunks = collect(
      t.transform(
        makeAssistantMsg("msg-A", [
          { type: "tool_use", id: "tc-1", name: "Read", input: { path: "/tmp" } },
        ]) as any,
      ),
    );
    const tool = chunks.find((c: any) => c.type === "tool-input-available");
    expect(tool).toMatchObject({ toolCallId: "tc-1", toolName: "Read", providerExecuted: true });
  });

  it("assistant with empty content → start + start-step only", () => {
    const chunks = collect(t.transform(makeAssistantMsg("msg-A", []) as any));
    expect(chunks.map((c: any) => c.type)).toEqual(["start", "start-step"]);
  });

  it("multiple tool_use in one message → multiple tool-input-available", () => {
    const chunks = collect(
      t.transform(
        makeAssistantMsg("msg-A", [
          { type: "tool_use", id: "tc-1", name: "Read", input: { path: "/a" } },
          { type: "tool_use", id: "tc-2", name: "Write", input: { path: "/b" } },
        ]) as any,
      ),
    );
    const tools = chunks.filter((c: any) => c.type === "tool-input-available");
    expect(tools).toHaveLength(2);
    expect(tools[0].toolCallId).toBe("tc-1");
    expect(tools[1].toolCallId).toBe("tc-2");
  });

  it("mixed content: thinking + text + tool_use in one message", () => {
    const chunks = collect(
      t.transform(
        makeAssistantMsg("msg-A", [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "I will read the file" },
          { type: "tool_use", id: "tc-1", name: "Read", input: { path: "/tmp" } },
        ]) as any,
      ),
    );
    const types = chunks.map((c: any) => c.type);
    expect(types).toEqual([
      "start",
      "start-step",
      "reasoning-start",
      "reasoning-delta",
      "reasoning-end",
      "text-start",
      "text-delta",
      "text-end",
      "tool-input-available",
    ]);
  });

  it("multiple tool_results in one user message", () => {
    const msg = {
      type: "user" as const,
      uuid: "u",
      session_id: "s",
      parent_tool_use_id: null,
      message: {
        role: "user" as const,
        content: [
          { type: "tool_result", tool_use_id: "tc-1", content: "ok", is_error: false },
          { type: "tool_result", tool_use_id: "tc-2", content: "fail", is_error: true },
        ],
      },
    };
    const chunks = collect(t.transform(msg as any));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ type: "tool-output-available", toolCallId: "tc-1" });
    expect(chunks[1]).toMatchObject({ type: "tool-output-error", toolCallId: "tc-2" });
  });

  it("compact_boundary does not break step tracking", () => {
    collect(t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "A" }]) as any));
    const compactChunks = collect(
      t.transform({
        type: "system" as const,
        subtype: "compact_boundary" as const,
        uuid: "cb",
        session_id: "s",
      } as any),
    );
    expect(compactChunks.map((c: any) => c.type)).toEqual(["data-system/compact_boundary"]);
    // Next assistant should still detect new step
    const nextChunks = collect(
      t.transform(makeAssistantMsg("msg-B", [{ type: "text", text: "B" }]) as any),
    );
    expect(nextChunks.map((c: any) => c.type)).toContain("finish-step");
    expect(nextChunks.map((c: any) => c.type)).toContain("start-step");
  });

  it("tool_use with parent_tool_use_id passes metadata", () => {
    const chunks = collect(
      t.transform({
        ...makeAssistantMsg("msg-A", [{ type: "tool_use", id: "tc-1", name: "Read", input: {} }]),
        parent_tool_use_id: "parent-tc",
      } as any),
    );
    const tool = chunks.find((c: any) => c.type === "tool-input-available");
    expect(tool.providerMetadata).toEqual({ claudeCode: { parentToolUseId: "parent-tc" } });
  });

  it("tool_use without parent_tool_use_id has no metadata", () => {
    const chunks = collect(
      t.transform(
        makeAssistantMsg("msg-A", [
          { type: "tool_use", id: "tc-1", name: "Read", input: {} },
        ]) as any,
      ),
    );
    const tool = chunks.find((c: any) => c.type === "tool-input-available");
    expect(tool.providerMetadata).toBeUndefined();
  });

  it("assistant thinking includes anthropic signature metadata", () => {
    const chunks = collect(
      t.transform(
        makeAssistantMsg("msg-A", [
          { type: "thinking", thinking: "hmm", signature: "sig-1" },
        ]) as any,
      ),
    );

    expect(chunks).toEqual([
      { type: "start", messageId: "msg-A" },
      { type: "start-step" },
      {
        type: "reasoning-start",
        id: "msg-A",
        providerMetadata: { anthropic: { signature: "sig-1" } },
      },
      { type: "reasoning-delta", id: "msg-A", delta: "hmm" },
      { type: "reasoning-end", id: "msg-A" },
    ]);
  });

  it("assistant redacted_thinking emits an empty reasoning part with metadata", () => {
    const chunks = collect(
      t.transform(
        makeAssistantMsg("msg-A", [{ type: "redacted_thinking", data: "redacted-1" }]) as any,
      ),
    );

    expect(chunks).toEqual([
      { type: "start", messageId: "msg-A" },
      { type: "start-step" },
      {
        type: "reasoning-start",
        id: "msg-A",
        providerMetadata: { anthropic: { redactedData: "redacted-1" } },
      },
      { type: "reasoning-end", id: "msg-A" },
    ]);
  });

  it("stream_event text happy path emits legal text chunks before result finish", () => {
    const streamedChunks = [
      ...collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeTextBlockStartEvent(0)) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeTextDeltaEvent(0, "Hel")) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeTextDeltaEvent(0, "lo")) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any)),
    ];

    expect(streamedChunks).toEqual([
      {
        type: "start",
        messageId: "msg-stream",
        messageMetadata: { sessionId: "sess-1", parentToolUseId: null },
      },
      { type: "start-step" },
      { type: "text-start", id: "text:msg-stream:0" },
      { type: "text-delta", id: "text:msg-stream:0", delta: "Hel" },
      { type: "text-delta", id: "text:msg-stream:0", delta: "lo" },
      { type: "text-end", id: "text:msg-stream:0" },
    ]);

    const resultChunks = collect(
      t.transform({
        type: "result" as const,
        subtype: "success" as const,
        uuid: "r",
        session_id: "s",
        is_error: false,
        num_turns: 1,
        duration_ms: 100,
        total_cost_usd: 0.001,
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
        errors: [],
      } as any),
    );

    expect(resultChunks.map((chunk: any) => chunk.type)).toEqual(["finish-step", "finish"]);
  });

  it("stream_event empty text delta emits nothing", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));
    collect(t.transform(makeStreamEventMsg(makeTextBlockStartEvent(0)) as any));

    const chunks = collect(t.transform(makeStreamEventMsg(makeTextDeltaEvent(0, "")) as any));

    expect(chunks).toEqual([]);
  });

  it("stream_event text delta before text start is ignored", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));

    const chunks = collect(t.transform(makeStreamEventMsg(makeTextDeltaEvent(0, "Hello")) as any));

    expect(chunks).toEqual([]);
  });

  it("stream_event thinking emits reasoning chunks", () => {
    const chunks = [
      ...collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeThinkingBlockStartEvent(0)) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeThinkingDeltaEvent(0, "hmm")) as any)),
      ...collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any)),
    ];

    expect(chunks).toEqual([
      {
        type: "start",
        messageId: "msg-stream",
        messageMetadata: { sessionId: "sess-1", parentToolUseId: null },
      },
      { type: "start-step" },
      { type: "reasoning-start", id: "reasoning:msg-stream:0" },
      { type: "reasoning-delta", id: "reasoning:msg-stream:0", delta: "hmm" },
      { type: "reasoning-end", id: "reasoning:msg-stream:0" },
    ]);
  });

  it("stream_event signature_delta matches anthropic provider behavior", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));
    collect(t.transform(makeStreamEventMsg(makeThinkingBlockStartEvent(0)) as any));

    const chunks = collect(
      t.transform(makeStreamEventMsg(makeSignatureDeltaEvent(0, "sig-1")) as any),
    );

    expect(chunks).toEqual([
      {
        type: "reasoning-delta",
        id: "reasoning:msg-stream:0",
        delta: "",
        providerMetadata: { anthropic: { signature: "sig-1" } },
      },
    ]);
  });

  it("stream_event redacted_thinking emits reasoning-start with anthropic metadata", () => {
    const chunks = [
      ...collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any)),
      ...collect(
        t.transform(
          makeStreamEventMsg(makeRedactedThinkingBlockStartEvent(0, "redacted-1")) as any,
        ),
      ),
      ...collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any)),
    ];

    expect(chunks).toEqual([
      {
        type: "start",
        messageId: "msg-stream",
        messageMetadata: { sessionId: "sess-1", parentToolUseId: null },
      },
      { type: "start-step" },
      {
        type: "reasoning-start",
        id: "reasoning:msg-stream:0",
        providerMetadata: { anthropic: { redactedData: "redacted-1" } },
      },
      { type: "reasoning-end", id: "reasoning:msg-stream:0" },
    ]);
  });

  it("stream_event signature_delta is ignored for non-thinking blocks", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));
    collect(t.transform(makeStreamEventMsg(makeTextBlockStartEvent(0)) as any));

    const chunks = collect(
      t.transform(makeStreamEventMsg(makeSignatureDeltaEvent(0, "sig-1")) as any),
    );

    expect(chunks).toEqual([]);
  });

  it("stream_event tool_use emits tool input chunks matching the anthropic provider flow", () => {
    const chunks = [
      ...collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any)),
      ...collect(
        t.transform(makeStreamEventMsg(makeToolUseBlockStartEvent(0, "call-1", "Read", {})) as any),
      ),
      ...collect(
        t.transform(
          makeStreamEventMsg(makeInputJsonDeltaEvent(0, '{"file_path":"/tmp/file.ts"}')) as any,
        ),
      ),
      ...collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any)),
    ];

    expect(chunks).toEqual([
      {
        type: "start",
        messageId: "msg-stream",
        messageMetadata: { sessionId: "sess-1", parentToolUseId: null },
      },
      { type: "start-step" },
      { type: "tool-input-start", toolCallId: "call-1", toolName: "Read", providerExecuted: true },
      {
        type: "tool-input-delta",
        toolCallId: "call-1",
        inputTextDelta: '{"file_path":"/tmp/file.ts"}',
      },
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "Read",
        input: { file_path: "/tmp/file.ts" },
        providerExecuted: true,
      },
    ]);
  });

  it("stream_event tool_use registers a tool invocation before tool_result reaches AI SDK", async () => {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const messages = [
          makeStreamEventMsg(makeMessageStartEvent("msg-stream")),
          makeStreamEventMsg(makeToolUseBlockStartEvent(0, "call-1", "Read", {})),
          makeStreamEventMsg(makeInputJsonDeltaEvent(0, '{"file_path":"/tmp/file.ts"}')),
          makeStreamEventMsg(makeBlockStopEvent(0)),
          {
            type: "user" as const,
            uuid: "user-tool-result",
            session_id: "sess-1",
            parent_tool_use_id: "call-1",
            message: {
              role: "user" as const,
              content: [
                {
                  type: "tool_result" as const,
                  tool_use_id: "call-1",
                  content: "ok",
                  is_error: false,
                },
              ],
            },
          },
        ];

        for (const message of messages) {
          for (const chunk of t.transform(message as any)) {
            writer.write(chunk);
          }
        }
      },
    });

    const uiMessages: any[] = [];
    for await (const message of readUIMessageStream({ stream })) {
      uiMessages.push(message);
    }

    expect(uiMessages.length).toBeGreaterThan(0);
    expect(uiMessages.at(-1)?.parts.map((part: any) => part.type)).toContain("tool-Read");
  });

  it("drops subagent kickoff prompt text when it duplicates an Agent prompt", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));
    collect(
      t.transform(
        makeStreamEventMsg(
          makeToolUseBlockStartEvent(0, "call-agent", "Agent", {
            prompt: "Explore the repository",
            description: "Repo scan",
            subagent_type: "Explore",
          }),
        ) as any,
      ),
    );
    collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any));

    const chunks = collect(
      t.transform(
        makeUserMsg([{ type: "text", text: "Explore the repository" }], {
          uuid: "user-agent",
          parentToolUseId: "call-agent",
        }) as any,
      ),
    );

    expect(chunks).toEqual([]);
  });

  it("keeps subagent user text when it does not duplicate an Agent prompt", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));
    collect(
      t.transform(
        makeStreamEventMsg(
          makeToolUseBlockStartEvent(0, "call-agent", "Agent", {
            prompt: "Explore the repository",
            description: "Repo scan",
            subagent_type: "Explore",
          }),
        ) as any,
      ),
    );
    collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any));

    const chunks = collect(
      t.transform(
        makeUserMsg([{ type: "text", text: "I will start with a glob search." }], {
          uuid: "user-agent",
          parentToolUseId: "call-agent",
        }) as any,
      ),
    );

    expect(chunks).toEqual([
      { type: "text-start", id: "user-agent" },
      { type: "text-delta", id: "user-agent", delta: "I will start with a glob search." },
      { type: "text-end", id: "user-agent" },
    ]);
  });

  it("real streamed tool_use sequence ignores the interleaved assistant snapshot", () => {
    const messages = loadFixture("real-tool-use-stream-sequence.json");
    const chunks = messages.flatMap((message) => collect(t.transform(message)));

    expect(
      chunks.filter(
        (chunk) =>
          chunk.type === "tool-input-available" &&
          chunk.toolCallId === "call_5e671a3f95a748c0957ed2bd",
      ),
    ).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "call_5e671a3f95a748c0957ed2bd",
        toolName: "Agent",
        input: {
          description: "Ultra-deep repo architecture analysis",
          prompt: "Perform an ultra-deep analysis of this repository's architecture.",
          subagent_type: "Explore",
        },
        providerExecuted: true,
      },
    ]);
  });

  it("stream_event message_stop does not emit finish", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));

    const chunks = collect(t.transform(makeStreamEventMsg(makeMessageStopEvent()) as any));

    expect(chunks).toEqual([]);
  });

  it("assistant message is skipped when the same message id already streamed via stream_event", () => {
    collect(t.transform(makeStreamEventMsg(makeMessageStartEvent("msg-stream")) as any));
    collect(t.transform(makeStreamEventMsg(makeTextBlockStartEvent(0)) as any));
    collect(t.transform(makeStreamEventMsg(makeTextDeltaEvent(0, "Hello")) as any));
    collect(t.transform(makeStreamEventMsg(makeBlockStopEvent(0)) as any));
    collect(t.transform(makeStreamEventMsg(makeMessageStopEvent()) as any));

    const chunks = collect(
      t.transform(makeAssistantMsg("msg-stream", [{ type: "text", text: "Hello" }]) as any),
    );

    expect(chunks).toEqual([]);
  });
});

describe("toUIEvent", () => {
  it("returns null for assistant (handled by stream)", () => {
    expect(toUIEvent(makeAssistantMsg("m", []) as any)).toBeNull();
  });

  it("returns null for system/init (handled by stream)", () => {
    expect(toUIEvent({ type: "system", subtype: "init" } as any)).toBeNull();
  });

  it("returns null for system/compact_boundary (handled by stream)", () => {
    expect(toUIEvent({ type: "system", subtype: "compact_boundary" } as any)).toBeNull();
  });

  it("returns event for rate_limit_event", () => {
    const r = toUIEvent({ type: "rate_limit_event", uuid: "uuid-r", session_id: "s" } as any);
    expect(r?.kind).toBe("event");
    expect((r as any).event.id).toBe("uuid-r");
  });

  it("returns event for system/status", () => {
    const r = toUIEvent({
      type: "system",
      subtype: "status",
      uuid: "uuid-s",
      session_id: "s",
      status: "running",
      permissionMode: "default",
    } as any);
    expect(r?.kind).toBe("event");
  });

  it("uses randomUUID when uuid is missing (tool_progress)", () => {
    const r = toUIEvent({
      type: "tool_progress",
      tool_use_id: "t",
      tool_name: "Read",
      elapsed_time_seconds: 1,
    } as any);
    expect(r?.kind).toBe("event");
    expect(typeof (r as any).event.id).toBe("string");
  });

  it("returns event for result (session done goes to subscribe stream too)", () => {
    const r = toUIEvent({
      type: "result",
      subtype: "success",
      uuid: "r",
      session_id: "s",
      is_error: false,
      num_turns: 1,
      duration_ms: 0,
      total_cost_usd: 0,
      usage: {},
      stop_reason: "end_turn",
      errors: [],
    } as any);
    expect(r?.kind).toBe("event");
  });

  it("returns null for user (handled by stream)", () => {
    const msg = {
      type: "user" as const,
      uuid: "u",
      session_id: "s",
      parent_tool_use_id: null,
      message: { role: "user" as const, content: [] },
    };
    expect(toUIEvent(msg as any)).toBeNull();
  });

  it("returns event for tool_use_summary", () => {
    const r = toUIEvent({ type: "tool_use_summary", uuid: "uuid-t", session_id: "s" } as any);
    expect(r?.kind).toBe("event");
  });

  it("returns event for auth_status", () => {
    const r = toUIEvent({ type: "auth_status", uuid: "uuid-a", session_id: "s" } as any);
    expect(r?.kind).toBe("event");
  });
});
