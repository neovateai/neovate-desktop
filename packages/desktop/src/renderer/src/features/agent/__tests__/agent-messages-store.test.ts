import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore, selectToolParts, selectTextContent, selectChildToolParts } from "../store";

describe("AgentStore – agentMessages", () => {
  beforeEach(() => {
    useAgentStore.setState({
      sessions: new Map(),
      activeSessionId: null,
      _nextMessageId: 0,
      timings: [],
    });
  });

  it("createSession initializes empty agentMessages", () => {
    useAgentStore.getState().createSession("s1");
    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.agentMessages).toEqual([]);
  });

  it("addUserMessage dual-writes to messages and agentMessages", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().addUserMessage("s1", "Hello");

    const session = useAgentStore.getState().sessions.get("s1")!;
    // Legacy
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toMatchObject({ role: "user", content: "Hello" });
    // Parts-based
    expect(session.agentMessages).toHaveLength(1);
    expect(session.agentMessages[0].role).toBe("user");
    expect(session.agentMessages[0].parts).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("appendChunk text_delta populates agentMessages", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "text_delta",
      sessionId: "s1",
      text: "Hello ",
    });
    useAgentStore.getState().appendChunk("s1", {
      type: "text_delta",
      sessionId: "s1",
      text: "world",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.agentMessages).toHaveLength(1);
    expect(session.agentMessages[0].role).toBe("assistant");
    expect(session.agentMessages[0].parts).toHaveLength(1);
    expect(session.agentMessages[0].parts[0]).toMatchObject({
      type: "text",
      text: "Hello world",
    });
  });

  it("appendChunk thinking_delta populates agentMessages", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "thinking_delta",
      sessionId: "s1",
      text: "reasoning...",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.agentMessages).toHaveLength(1);
    const parts = session.agentMessages[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "thinking", thinking: "reasoning..." });
  });

  it("appendChunk tool_input_available adds ToolInvocationPart", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "tool_input_available",
      sessionId: "s1",
      toolCallId: "tc1",
      toolName: "Bash",
      input: { command: "ls" },
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.agentMessages).toHaveLength(1);
    const part = session.agentMessages[0].parts[0];
    expect(part).toMatchObject({
      type: "tool-invocation",
      toolCallId: "tc1",
      toolName: "Bash",
      state: "input-available",
      input: { command: "ls" },
    });
  });

  it("appendChunk tool_output_available updates matching ToolInvocationPart", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "tool_input_available",
      sessionId: "s1",
      toolCallId: "tc1",
      toolName: "Read",
      input: { file_path: "test.ts" },
    });
    useAgentStore.getState().appendChunk("s1", {
      type: "tool_output_available",
      sessionId: "s1",
      toolCallId: "tc1",
      output: "file contents",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    const part = session.agentMessages[0].parts[0];
    expect(part).toMatchObject({
      type: "tool-invocation",
      state: "output-available",
      output: "file contents",
    });
  });

  it("appendChunk tool_output_error updates matching ToolInvocationPart", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "tool_input_available",
      sessionId: "s1",
      toolCallId: "tc1",
      toolName: "Bash",
      input: { command: "bad" },
    });
    useAgentStore.getState().appendChunk("s1", {
      type: "tool_output_error",
      sessionId: "s1",
      toolCallId: "tc1",
      errorText: "command not found",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    const part = session.agentMessages[0].parts[0];
    expect(part).toMatchObject({
      type: "tool-invocation",
      state: "output-error",
      errorText: "command not found",
    });
  });

  it("appendChunk user_message dual-writes", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "user_message",
      sessionId: "s1",
      text: "replayed user msg",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.agentMessages).toHaveLength(1);
    expect(session.agentMessages[0].parts[0]).toMatchObject({
      type: "text",
      text: "replayed user msg",
    });
  });

  it("tool_input_available with parentToolUseId sets parentToolUseId", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().appendChunk("s1", {
      type: "tool_input_available",
      sessionId: "s1",
      toolCallId: "tc-child",
      toolName: "Read",
      input: { file_path: "x.ts" },
      parentToolUseId: "tc-parent",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    const part = session.agentMessages[0].parts[0];
    expect(part).toMatchObject({
      type: "tool-invocation",
      parentToolUseId: "tc-parent",
    });
  });
});

describe("Selector helpers", () => {
  it("selectToolParts filters tool-invocation parts", () => {
    const msg = {
      id: "1",
      role: "assistant" as const,
      parts: [
        { type: "text" as const, text: "hello" },
        {
          type: "tool-invocation" as const,
          toolCallId: "tc1",
          toolName: "Bash" as const,
          state: "input-available" as const,
          input: {},
        },
        { type: "thinking" as const, thinking: "hmm" },
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
        { type: "thinking" as const, thinking: "hmm" },
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
          type: "tool-invocation" as const,
          toolCallId: "parent",
          toolName: "Task" as const,
          state: "input-available" as const,
          input: {},
        },
        {
          type: "tool-invocation" as const,
          toolCallId: "child1",
          toolName: "Read" as const,
          state: "output-available" as const,
          input: {},
          output: "ok",
          parentToolUseId: "parent",
        },
        {
          type: "tool-invocation" as const,
          toolCallId: "child2",
          toolName: "Bash" as const,
          state: "input-available" as const,
          input: {},
          parentToolUseId: "other-parent",
        },
      ],
    };
    const children = selectChildToolParts(msg, "parent");
    expect(children).toHaveLength(1);
    expect(children[0].toolCallId).toBe("child1");
  });
});

describe("restoreFromCache with agentMessages", () => {
  beforeEach(() => {
    useAgentStore.setState({
      sessions: new Map(),
      activeSessionId: null,
      _nextMessageId: 0,
      timings: [],
    });
  });

  it("restores agentMessages from cache when present", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().restoreFromCache("s1", {
      messages: [{ id: "m1", role: "user", content: "hi" }],
      agentMessages: [
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
    expect(session.agentMessages).toHaveLength(1);
    expect(session.agentMessages[0].parts[0]).toMatchObject({
      type: "text",
      text: "hi",
    });
  });

  it("falls back to converting legacy messages when agentMessages is absent", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().restoreFromCache("s1", {
      messages: [
        { id: "m1", role: "user", content: "hello" },
        { id: "m2", role: "assistant", content: "world", thinking: "reasoning" },
      ],
      title: "Legacy",
      updatedAt: new Date().toISOString(),
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.agentMessages).toHaveLength(2);
    // User message converts to text part
    expect(session.agentMessages[0].parts).toEqual([{ type: "text", text: "hello" }]);
    // Assistant message with thinking converts to thinking + text parts
    expect(session.agentMessages[1].parts).toEqual([
      { type: "thinking", thinking: "reasoning" },
      { type: "text", text: "world" },
    ]);
  });
});
