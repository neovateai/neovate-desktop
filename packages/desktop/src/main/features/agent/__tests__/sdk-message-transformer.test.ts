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

  it("assistant text → start-step + text-start/delta/end", () => {
    const chunks = collect(
      t.transform(makeAssistantMsg("msg-A", [{ type: "text", text: "Hello" }]) as any),
    );
    expect(chunks.map((c: any) => c.type)).toEqual([
      "start-step",
      "text-start",
      "text-delta",
      "text-end",
    ]);
    expect(chunks.find((c: any) => c.type === "text-delta").delta).toBe("Hello");
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
    const types = second.map((c: any) => c.type);
    expect(types[0]).toBe("finish-step");
    expect(types[1]).toBe("start-step");
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
