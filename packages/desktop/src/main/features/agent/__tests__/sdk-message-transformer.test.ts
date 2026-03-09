import { describe, it, expect, beforeEach } from "vitest";

import { SDKMessageTransformer, toUIEvent } from "../sdk-message-transformer";

function collect(gen: Generator<any>): any[] {
  const out: any[] = [];
  for (const item of gen) out.push(item);
  return out;
}

const makeAssistantMsg = (id: string, content: any[]) => ({
  type: "assistant" as const,
  uuid: "uuid-a",
  session_id: "sess-1",
  parent_tool_use_id: null,
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
