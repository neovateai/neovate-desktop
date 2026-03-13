import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
}));

import type { ConfigStore } from "../../config/config-store";
import type { ProjectStore } from "../../project/project-store";

import { Pushable } from "../pushable";
import { SessionManager, PERMISSION_TIMEOUT_MS } from "../session-manager";

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

const makeTextBlockStartEvent = (index: number) => ({
  type: "content_block_start" as const,
  index,
  content_block: { type: "text" as const, text: "", citations: null },
});

const makeTextDeltaEvent = (index: number, text: string) => ({
  type: "content_block_delta" as const,
  index,
  delta: { type: "text_delta" as const, text },
});

const makeBlockStopEvent = (index: number) => ({
  type: "content_block_stop" as const,
  index,
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

  it("exports PERMISSION_TIMEOUT_MS", () => {
    expect(PERMISSION_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("enables partial assistant messages in query options", () => {
    const queryOptions = (manager as any).queryOptions({
      sessionId: "session-1",
      cwd: "/tmp/project",
    });

    expect(queryOptions.includePartialMessages).toBe(true);
  });

  it("streams text chunks incrementally from stream_event messages", async () => {
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
      pendingRequests: new Map(),
    });

    const stream = manager.stream("session-1", {
      id: "user-msg-1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    } as any);

    const firstChunkPromise = stream.next();
    queryMessages.push(makeStreamEventMsg(makeMessageStartEvent("msg-stream")));

    await expect(firstChunkPromise).resolves.toMatchObject({
      done: false,
      value: { type: "start", messageId: "msg-stream" },
    });
    await expect(stream.next()).resolves.toMatchObject({
      done: false,
      value: { type: "start-step" },
    });

    const textStartPromise = stream.next();
    queryMessages.push(makeStreamEventMsg(makeTextBlockStartEvent(0)));
    await expect(textStartPromise).resolves.toMatchObject({
      done: false,
      value: { type: "text-start", id: "text:msg-stream:0" },
    });

    const firstDeltaPromise = stream.next();
    queryMessages.push(makeStreamEventMsg(makeTextDeltaEvent(0, "Hel")));
    await expect(firstDeltaPromise).resolves.toMatchObject({
      done: false,
      value: { type: "text-delta", id: "text:msg-stream:0", delta: "Hel" },
    });

    const secondDeltaPromise = stream.next();
    queryMessages.push(makeStreamEventMsg(makeTextDeltaEvent(0, "lo")));
    await expect(secondDeltaPromise).resolves.toMatchObject({
      done: false,
      value: { type: "text-delta", id: "text:msg-stream:0", delta: "lo" },
    });

    const textEndPromise = stream.next();
    queryMessages.push(makeStreamEventMsg(makeBlockStopEvent(0)));
    await expect(textEndPromise).resolves.toMatchObject({
      done: false,
      value: { type: "text-end", id: "text:msg-stream:0" },
    });

    const finishStepPromise = stream.next();
    queryMessages.push(makeResultMsg());
    await expect(finishStepPromise).resolves.toMatchObject({
      done: false,
      value: { type: "finish-step" },
    });
    await expect(stream.next()).resolves.toMatchObject({
      done: false,
      value: { type: "finish" },
    });
    await expect(stream.next()).resolves.toMatchObject({ done: true, value: undefined });

    expect(input.push).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user",
        message: { role: "user", content: "Hello" },
        parent_tool_use_id: null,
        session_id: "session-1",
      }),
    );
  });
});
