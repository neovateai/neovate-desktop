import { describe, it, expect } from "vitest";
import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import { AcpConnection, type SdkRef } from "../connection";

function makeConnection(id = "test-conn"): AcpConnection {
  const sdkRef: SdkRef = { value: {} as ClientSideConnection };
  return new AcpConnection(id, sdkRef);
}

describe("AcpConnection", () => {
  it("emits session update events to subscribers", async () => {
    const conn = makeConnection();
    const events: unknown[] = [];

    const ac = new AbortController();
    const sub = conn.subscribeSession(ac.signal);

    // Collect events in background
    const collecting = (async () => {
      for await (const event of sub) {
        events.push(event);
        if (events.length >= 2) break;
      }
    })();

    conn.emitSessionUpdate({
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    });

    conn.emitSessionUpdate({
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "world" },
      },
    });

    await collecting;
    ac.abort();

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        },
      },
    });
  });

  it("handles permission request lifecycle", async () => {
    const conn = makeConnection();

    const events: unknown[] = [];
    const ac = new AbortController();
    const sub = conn.subscribeSession(ac.signal);

    const collecting = (async () => {
      for await (const event of sub) {
        events.push(event);
        if (events.length >= 1) break;
      }
    })();

    const permPromise = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: {
        toolCallId: "tc1",
        title: "Test tool",
        kind: "edit",
        status: "pending",
      },
      options: [{ kind: "allow_once", name: "Allow", optionId: "allow" }],
    });

    await collecting;
    ac.abort();

    // Should have emitted a permission_request event
    expect(events[0]).toMatchObject({
      type: "permission_request",
      requestId: expect.any(String),
    });

    const requestId = (events[0] as { requestId: string }).requestId;

    // Resolve the permission
    conn.resolvePermission(requestId, "allow");

    const result = await permPromise;
    expect(result).toEqual({
      outcome: { outcome: "selected", optionId: "allow" },
    });
  });

  it("resolvePermission is no-op for unknown requestId", () => {
    const conn = makeConnection();
    // Should not throw
    conn.resolvePermission("nonexistent", "allow");
  });

  it("dispose cancels pending permissions", async () => {
    const conn = makeConnection();

    const permPromise = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: {
        toolCallId: "tc1",
        title: "Test",
        kind: "edit",
        status: "pending",
      },
      options: [{ kind: "allow_once", name: "Allow", optionId: "allow" }],
    });

    conn.dispose();

    const result = await permPromise;
    expect(result).toEqual({ outcome: { outcome: "cancelled" } });
  });
});
