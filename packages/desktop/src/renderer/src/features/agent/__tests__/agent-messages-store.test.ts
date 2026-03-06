import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore, selectToolParts, selectTextContent, selectChildToolParts } from "../store";

describe("AgentStore – messages", () => {
  beforeEach(() => {
    useAgentStore.setState({
      sessions: new Map(),
      activeSessionId: null,
      _nextMessageId: 0,
      timings: [],
    });
  });

  it("createSession initializes empty messages", () => {
    useAgentStore.getState().createSession("s1");
    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toEqual([]);
  });

  it("addUserMessage writes to messages", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().addUserMessage("s1", "Hello");

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[0].parts).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("appendChunk text part populates messages", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "text",
      text: "Hello ",
      state: "streaming",
    });
    useAgentStore.getState().appendChunk("s1", {
      type: "text",
      text: "world",
      state: "streaming",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("assistant");
    expect(session.messages[0].parts).toHaveLength(1);
    expect(session.messages[0].parts[0]).toMatchObject({
      type: "text",
      text: "Hello world",
    });
  });

  it("appendChunk reasoning part populates messages", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "reasoning",
      text: "reasoning...",
      state: "streaming",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    const parts = session.messages[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "reasoning", text: "reasoning..." });
  });

  it("appendChunk dynamic-tool adds tool part", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "dynamic-tool",
      toolCallId: "tc1",
      toolName: "Bash",
      state: "input-available",
      input: { command: "ls" },
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    const part = session.messages[0].parts[0];
    expect(part).toMatchObject({
      type: "dynamic-tool",
      toolCallId: "tc1",
      toolName: "Bash",
      state: "input-available",
      input: { command: "ls" },
    });
  });

  it("appendChunk dynamic-tool output-available updates matching tool", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "dynamic-tool",
      toolCallId: "tc1",
      toolName: "Read",
      state: "input-available",
      input: { file_path: "test.ts" },
    });
    useAgentStore.getState().appendChunk("s1", {
      type: "dynamic-tool",
      toolCallId: "tc1",
      toolName: "Read",
      state: "output-available",
      input: { file_path: "test.ts" },
      output: "file contents",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    const part = session.messages[0].parts[0];
    expect(part).toMatchObject({
      type: "dynamic-tool",
      state: "output-available",
      output: "file contents",
    });
  });

  it("appendChunk dynamic-tool output-error updates matching tool", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "dynamic-tool",
      toolCallId: "tc1",
      toolName: "Bash",
      state: "input-available",
      input: { command: "bad" },
    });
    useAgentStore.getState().appendChunk("s1", {
      type: "dynamic-tool",
      toolCallId: "tc1",
      toolName: "Bash",
      state: "output-error",
      input: { command: "bad" },
      errorText: "command not found",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    const part = session.messages[0].parts[0];
    expect(part).toMatchObject({
      type: "dynamic-tool",
      state: "output-error",
      errorText: "command not found",
    });
  });

  it("appendChunk data-permission-request sets pending permission", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "data-permission-request",
      data: {
        requestId: "req1",
        toolName: "Bash",
        input: { command: "rm -rf" },
      },
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.pendingPermission).toMatchObject({
      requestId: "req1",
      toolName: "Bash",
      input: { command: "rm -rf" },
    });
  });

  it("appendChunk data-available-commands sets available commands", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "data-available-commands",
      data: {
        commands: [{ name: "test" }],
      },
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.availableCommands).toEqual([{ name: "test" }]);
  });

  it("appendChunk data-result updates usage", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "data-result",
      data: {
        stopReason: "end_turn",
        costUsd: 0.01,
        durationMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
      },
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.usage).toMatchObject({
      totalCostUsd: 0.01,
      totalDurationMs: 1000,
      totalInputTokens: 100,
      totalOutputTokens: 50,
    });
  });
});

describe("Selector helpers", () => {
  it("selectToolParts filters dynamic-tool parts", () => {
    const msg = {
      id: "1",
      role: "assistant" as const,
      parts: [
        { type: "text" as const, text: "hello" },
        {
          type: "dynamic-tool" as const,
          toolCallId: "tc1",
          toolName: "Bash",
          state: "input-available" as const,
          input: {},
        },
        { type: "reasoning" as const, text: "hmm" },
      ],
    };
    const tools = selectToolParts(msg);
    expect(tools).toHaveLength(1);
    expect(tools[0].toolCallId).toBe("tc1");
  });

  it("selectTextContent joins text parts", () => {
    const msg = {
      id: "1",
      role: "assistant" as const,
      parts: [
        { type: "text" as const, text: "hello " },
        { type: "reasoning" as const, text: "hmm" },
        { type: "text" as const, text: "world" },
      ],
    };
    expect(selectTextContent(msg)).toBe("hello world");
  });

  it("selectChildToolParts finds child parts by parentToolUseId", () => {
    const msg = {
      id: "1",
      role: "assistant" as const,
      parts: [
        {
          type: "dynamic-tool" as const,
          toolCallId: "parent",
          toolName: "Task",
          state: "input-available" as const,
          input: {},
        },
        {
          type: "dynamic-tool" as const,
          toolCallId: "child1",
          toolName: "Read",
          state: "output-available" as const,
          input: {},
          output: "ok",
          callProviderMetadata: { context: { parentToolUseId: "parent" } },
        },
        {
          type: "dynamic-tool" as const,
          toolCallId: "child2",
          toolName: "Bash",
          state: "input-available" as const,
          input: {},
          callProviderMetadata: { context: { parentToolUseId: "other-parent" } },
        },
      ],
    };
    const children = selectChildToolParts(msg, "parent");
    expect(children).toHaveLength(1);
    expect(children[0].toolCallId).toBe("child1");
  });
});

describe("restoreFromCache", () => {
  beforeEach(() => {
    useAgentStore.setState({
      sessions: new Map(),
      activeSessionId: null,
      _nextMessageId: 0,
      timings: [],
    });
  });

  it("restores messages from cache", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().restoreFromCache("s1", {
      messages: [
        {
          id: "cached-1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
        },
      ],
      title: "Test",
      updatedAt: new Date().toISOString(),
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].parts[0]).toMatchObject({
      type: "text",
      text: "hi",
    });
  });
});
