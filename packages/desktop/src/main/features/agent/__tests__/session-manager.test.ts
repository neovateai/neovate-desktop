import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
}));

import type { ConfigStore } from "../../config/config-store";
import type { ProjectStore } from "../../project/project-store";

import { Pushable } from "../pushable";
import { RequestTracker } from "../request-tracker";
import { SessionManager } from "../session-manager";

const makeStreamEventMsg = (event: any) => ({
  type: "stream_event" as const,
  event,
  uuid: "stream-uuid",
  session_id: "session-1",
  parent_tool_use_id: null,
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

const makeResultMsg = () => ({
  type: "result" as const,
  subtype: "success" as const,
  uuid: "result-uuid",
  session_id: "session-1",
  is_error: false,
  num_turns: 1,
  duration_ms: 10,
  total_cost_usd: 0.001,
  usage: { input_tokens: 10, output_tokens: 5 },
  stop_reason: "end_turn",
  errors: [],
});

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(
      { get: vi.fn(() => undefined) } as unknown as ConfigStore,
      {} as ProjectStore,
      new RequestTracker(),
      {
        onTurnStart: vi.fn(),
        onTurnEnd: vi.fn(),
        onSessionClosed: vi.fn(),
      } as unknown as import("../../../core/power-blocker-service").PowerBlockerService,
    );
  });

  it("closeSession for unknown sessionId does not throw", async () => {
    await expect(manager.closeSession("nonexistent")).resolves.toBeUndefined();
  });

  it("closeAll on empty manager does not throw", async () => {
    await expect(manager.closeAll()).resolves.toBeUndefined();
  });

  it("listSessions returns empty array for nonexistent dir", async () => {
    const sessions = await manager.listSessions("/tmp/nonexistent-" + Date.now());
    expect(sessions).toBeInstanceOf(Array);
  });

  it("enables partial assistant messages in query options", () => {
    const queryOptions = (manager as any).queryOptions({
      sessionId: "session-1",
      cwd: "/tmp/project",
    });

    expect(queryOptions.includePartialMessages).toBe(true);
  });

  it("send() converts UIMessage to SDKUserMessage and pushes to input", async () => {
    const input = { push: vi.fn() };
    const queryMessages = new Pushable<any>();
    const queryIterator = queryMessages[Symbol.asyncIterator]();
    const query = {
      next: () => queryIterator.next(),
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    (manager as any).sessions.set("session-1", {
      input,
      query,
      cwd: "/tmp/project",
      consumeExited: false,
      uiToSdkMessageIds: new Map(),
      pendingRequests: new Map(),
    });

    await manager.send("session-1", {
      id: "user-msg-1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    } as any);

    expect(input.push).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user",
        message: { role: "user", content: "Hello" },
        parent_tool_use_id: null,
        session_id: "session-1",
      }),
    );
  });

  it("send() throws for unknown sessionId", async () => {
    await expect(
      manager.send("nonexistent", {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      } as any),
    ).rejects.toThrow("Unknown session");
  });

  it("send() throws if consume loop has exited", async () => {
    const input = { push: vi.fn() };
    const queryMessages = new Pushable<any>();
    const queryIterator = queryMessages[Symbol.asyncIterator]();
    const query = {
      next: () => queryIterator.next(),
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    (manager as any).sessions.set("session-1", {
      input,
      query,
      cwd: "/tmp/project",
      consumeExited: true,
      pendingRequests: new Map(),
    });

    await expect(
      manager.send("session-1", {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      } as any),
    ).rejects.toThrow("consume loop has exited");
  });

  it("send() starts requestTracker turn and powerBlocker", async () => {
    const input = { push: vi.fn() };
    const queryMessages = new Pushable<any>();
    const queryIterator = queryMessages[Symbol.asyncIterator]();
    const query = {
      next: () => queryIterator.next(),
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    (manager as any).sessions.set("session-1", {
      input,
      query,
      cwd: "/tmp/project",
      consumeExited: false,
      uiToSdkMessageIds: new Map(),
      pendingRequests: new Map(),
    });

    await manager.send("session-1", {
      id: "user-msg-1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    } as any);

    expect((manager as any).powerBlocker.onTurnStart).toHaveBeenCalledWith("session-1");
  });

  it("consume() publishes chunks through eventPublisher", async () => {
    const input = { push: vi.fn() };
    const queryMessages = new Pushable<any>();
    const queryIterator = queryMessages[Symbol.asyncIterator]();
    const query = {
      next: () => queryIterator.next(),
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    (manager as any).sessions.set("session-1", {
      input,
      query,
      cwd: "/tmp/project",
      consumeExited: false,
      uiToSdkMessageIds: new Map(),
      pendingRequests: new Map(),
    });

    const published: any[] = [];
    const originalPublish = manager.eventPublisher.publish.bind(manager.eventPublisher);
    vi.spyOn(manager.eventPublisher, "publish").mockImplementation((key, value) => {
      published.push(value);
      return originalPublish(key, value);
    });

    const consumePromise = (manager as any).consume("session-1");

    // Push a message_start event
    queryMessages.push(makeStreamEventMsg(makeMessageStartEvent("msg-1")));
    // Allow microtask processing
    await new Promise((r) => setTimeout(r, 50));

    // Push result to end the loop
    queryMessages.push(makeResultMsg());
    // End the query iterator
    queryMessages.end();

    await consumePromise;

    // Should have published chunk events
    const chunkEvents = published.filter((e) => e.kind === "chunk");
    expect(chunkEvents.length).toBeGreaterThan(0);
    expect(chunkEvents[0]).toMatchObject({ kind: "chunk", chunk: { type: "start" } });

    // Should have published context_usage event on result
    const contextUsageEvents = published.filter(
      (e) => e.kind === "event" && e.event.type === "context_usage",
    );
    expect(contextUsageEvents.length).toBe(1);
  });

  it("consume() sets consumeExited when done", async () => {
    const input = { push: vi.fn() };
    const queryMessages = new Pushable<any>();
    const queryIterator = queryMessages[Symbol.asyncIterator]();
    const query = {
      next: () => queryIterator.next(),
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    (manager as any).sessions.set("session-1", {
      input,
      query,
      cwd: "/tmp/project",
      consumeExited: false,
      uiToSdkMessageIds: new Map(),
      pendingRequests: new Map(),
    });

    const consumePromise = (manager as any).consume("session-1");
    queryMessages.end();
    await consumePromise;

    const session = (manager as any).sessions.get("session-1");
    expect(session.consumeExited).toBe(true);
  });

  it("consume() calls powerBlocker.onTurnEnd in finally block", async () => {
    const input = { push: vi.fn() };
    const queryMessages = new Pushable<any>();
    const queryIterator = queryMessages[Symbol.asyncIterator]();
    const query = {
      next: () => queryIterator.next(),
      interrupt: vi.fn(),
      setPermissionMode: vi.fn(),
    };

    (manager as any).sessions.set("session-1", {
      input,
      query,
      cwd: "/tmp/project",
      consumeExited: false,
      uiToSdkMessageIds: new Map(),
      pendingRequests: new Map(),
    });

    const consumePromise = (manager as any).consume("session-1");
    queryMessages.end();
    await consumePromise;

    expect((manager as any).powerBlocker.onTurnEnd).toHaveBeenCalledWith("session-1");
  });
});
