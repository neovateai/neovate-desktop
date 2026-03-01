import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AcpConnection, PERMISSION_TIMEOUT_MS } from "../connection";

describe("AcpConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolvePermission resolves the pending promise with selected outcome", async () => {
    const conn = new AcpConnection("test-1");

    // handlePermissionRequest publishes a permission_request event
    // and returns a promise that resolves when resolvePermission is called.
    const permPromise = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: { toolCallId: "tc1", title: "Read file", kind: "read", status: "pending" },
      options: [{ kind: "allow_once", name: "Allow", optionId: "allow" }],
    });

    // Resolve immediately — requestId starts at 1
    conn.resolvePermission("1", "allow");

    const result = await permPromise;
    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  });

  it("resolvePermission with unknown requestId is a no-op", () => {
    const conn = new AcpConnection("test-1");
    // Should not throw
    conn.resolvePermission("nonexistent", "allow");
  });

  it("permission auto-cancels after timeout", async () => {
    const conn = new AcpConnection("test-1");
    const permPromise = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: { toolCallId: "tc1", title: "Edit file", kind: "edit", status: "pending" },
      options: [{ kind: "allow_once", name: "Allow", optionId: "allow" }],
    });

    vi.advanceTimersByTime(PERMISSION_TIMEOUT_MS);

    const result = await permPromise;
    expect(result).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("resolving before timeout clears the timer", async () => {
    const conn = new AcpConnection("test-1");
    const permPromise = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: { toolCallId: "tc1", title: "Read", kind: "read", status: "pending" },
      options: [{ kind: "allow_once", name: "Allow", optionId: "a" }],
    });

    conn.resolvePermission("1", "a");
    const result = await permPromise;
    expect(result).toEqual({ outcome: { outcome: "selected", optionId: "a" } });

    // Advancing past timeout should not cause issues
    vi.advanceTimersByTime(PERMISSION_TIMEOUT_MS + 1000);
  });

  it("dispose() cancels all pending permissions", async () => {
    const conn = new AcpConnection("test-1");

    const perm1 = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: { toolCallId: "tc1", title: "Read", kind: "read", status: "pending" },
      options: [{ kind: "allow_once", name: "Allow", optionId: "a" }],
    });

    const perm2 = conn.handlePermissionRequest({
      sessionId: "s1",
      toolCall: { toolCallId: "tc2", title: "Write", kind: "edit", status: "pending" },
      options: [{ kind: "allow_once", name: "Allow", optionId: "a" }],
    });

    conn.dispose();

    const [r1, r2] = await Promise.all([perm1, perm2]);
    expect(r1).toEqual({ outcome: { outcome: "cancelled" } });
    expect(r2).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("emitSessionUpdate publishes acpx_event events", async () => {
    vi.useRealTimers(); // Need real timers for async generator

    const conn = new AcpConnection("test-1");
    const ac = new AbortController();
    const sub = conn.subscribeSession(ac.signal);

    // Use a valid SessionNotification shape
    conn.emitSessionUpdate({
      method: "notifications/sessionUpdate",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    } as any);

    // Read the first event, then abort to stop
    const { value } = await sub.next();
    ac.abort();
    await sub.return(undefined);

    expect(value).toMatchObject({ type: "acpx_event" });
    expect(value!.type === "acpx_event" && value!.event.session_id).toBe("test-1");
  });

  it("client getter throws if not initialized", () => {
    const conn = new AcpConnection("test-1");
    expect(() => conn.client).toThrow("Client not initialized");
  });

  it("setClient makes client accessible", () => {
    const conn = new AcpConnection("test-1");
    const fakeClient = { fake: true } as any;
    conn.setClient(fakeClient);
    expect(conn.client).toBe(fakeClient);
  });
});
