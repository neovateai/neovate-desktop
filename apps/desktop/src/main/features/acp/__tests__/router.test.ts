import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { AcpConnectionManager } from "../connection-manager";
import type { SessionEvent } from "../../../../shared/features/acp/types";

const MOCK_AGENT_PATH = join(__dirname, "../../../../..", "test/fixtures/mock-agent.ts");

/** Collect events until aborted, swallowing AbortError */
async function collectEvents(
  sub: AsyncGenerator<SessionEvent>,
  events: SessionEvent[],
  onEvent?: (event: SessionEvent) => void,
): Promise<void> {
  try {
    for await (const event of sub) {
      events.push(event);
      onEvent?.(event);
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    throw e;
  }
}

describe("ACP integration", () => {
  let manager: AcpConnectionManager;

  afterEach(() => {
    manager?.disconnectAll();
  });

  it("full flow: connect → newSession → prompt → receive events", async () => {
    manager = new AcpConnectionManager();
    const conn = await manager.connect({
      id: "mock",
      name: "Mock Agent",
      command: "bun",
      args: [MOCK_AGENT_PATH],
    });

    const session = await conn.sdk.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });
    expect(session.sessionId).toBeTruthy();

    const events: SessionEvent[] = [];
    const ac = new AbortController();
    const sub = conn.subscribeSession(ac.signal);

    // Run collection and prompt concurrently
    const collecting = collectEvents(sub, events);

    const result = await conn.sdk.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Hello" }],
    });

    // Give a moment for trailing events, then stop collection
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await collecting;

    expect(result.stopReason).toBe("end_turn");
    expect(events.length).toBeGreaterThan(0);

    const textEvents = events.filter(
      (e) => e.type === "update" && e.data.update.sessionUpdate === "agent_message_chunk",
    );
    expect(textEvents.length).toBeGreaterThan(0);
  }, 30000);

  it("prompt with tool calls", async () => {
    manager = new AcpConnectionManager();
    const conn = await manager.connect({
      id: "mock",
      name: "Mock Agent",
      command: "bun",
      args: [MOCK_AGENT_PATH],
      env: { MOCK_EMIT_TOOL_CALL: "1" },
    });

    const session = await conn.sdk.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });

    const events: SessionEvent[] = [];
    const ac = new AbortController();
    const sub = conn.subscribeSession(ac.signal);

    const collecting = collectEvents(sub, events);

    await conn.sdk.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Do tool calls" }],
    });

    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await collecting;

    const toolEvents = events.filter(
      (e) =>
        e.type === "update" &&
        (e.data.update.sessionUpdate === "tool_call" ||
          e.data.update.sessionUpdate === "tool_call_update"),
    );
    expect(toolEvents.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("permission flow: prompt triggers permission → resolve → agent continues", async () => {
    manager = new AcpConnectionManager();
    const conn = await manager.connect({
      id: "mock",
      name: "Mock Agent",
      command: "bun",
      args: [MOCK_AGENT_PATH],
      env: { MOCK_EMIT_PERMISSION: "1" },
    });

    const session = await conn.sdk.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });

    const events: SessionEvent[] = [];
    const ac = new AbortController();
    const sub = conn.subscribeSession(ac.signal);

    const collecting = collectEvents(sub, events, (event) => {
      if (event.type === "permission_request") {
        setTimeout(() => conn.resolvePermission(event.requestId, "allow"), 10);
      }
    });

    const result = await conn.sdk.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Need permission" }],
    });

    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await collecting;

    expect(result.stopReason).toBe("end_turn");

    const permEvents = events.filter((e) => e.type === "permission_request");
    expect(permEvents.length).toBe(1);
  }, 30000);

  it("disconnect removes connection", async () => {
    manager = new AcpConnectionManager();
    const conn = await manager.connect({
      id: "mock",
      name: "Mock Agent",
      command: "bun",
      args: [MOCK_AGENT_PATH],
    });

    const id = conn.id;
    manager.disconnect(id);
    expect(manager.get(id)).toBeUndefined();
  }, 15000);
});
