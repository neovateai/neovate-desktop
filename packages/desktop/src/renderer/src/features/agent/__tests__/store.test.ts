import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "../store";

describe("AgentStore", () => {
  beforeEach(() => {
    useAgentStore.setState({
      sessions: new Map(),
      activeSessionId: null,
    });
  });

  it("creates a session and sets it active", () => {
    useAgentStore.getState().createSession("s1");

    const state = useAgentStore.getState();
    expect(state.sessions.get("s1")).toBeDefined();
    expect(state.activeSessionId).toBe("s1");
  });

  it("adds user message", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().addUserMessage("s1", "Hello");

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
  });

  it("appendChunk with text_delta appends text", () => {
    useAgentStore.getState().createSession("s1");

    useAgentStore
      .getState()
      .appendChunk("s1", { type: "text_delta", sessionId: "s1", text: "Hello " });

    useAgentStore
      .getState()
      .appendChunk("s1", { type: "text_delta", sessionId: "s1", text: "world" });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe("Hello world");
    expect(session.messages[0].role).toBe("assistant");
  });

  it("appendChunk with thinking_delta appends thinking", () => {
    useAgentStore.getState().createSession("s1");

    useAgentStore
      .getState()
      .appendChunk("s1", { type: "thinking_delta", sessionId: "s1", text: "thinking..." });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].thinking).toBe("thinking...");
  });

  it("appendChunk with tool_use adds tool to last assistant message", () => {
    useAgentStore.getState().createSession("s1");

    // First create an assistant message via text_delta
    useAgentStore.getState().appendChunk("s1", {
      type: "text_delta",
      sessionId: "s1",
      text: "Let me read that file.",
    });

    useAgentStore.getState().appendChunk("s1", {
      type: "tool_use",
      sessionId: "s1",
      toolId: "tc1",
      name: "Read",
      status: "running",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].toolCalls).toHaveLength(1);
    expect(session.messages[0].toolCalls![0]).toMatchObject({
      toolCallId: "tc1",
      name: "Read",
      status: "running",
    });
  });

  it("appendChunk with tool_use creates assistant message if none exists", () => {
    useAgentStore.getState().createSession("s1");

    useAgentStore.getState().appendChunk("s1", {
      type: "tool_use",
      sessionId: "s1",
      toolId: "tc1",
      name: "Read",
      status: "running",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].role).toBe("assistant");
    expect(session.messages[0].toolCalls).toHaveLength(1);
  });

  it("appendChunk with tool_use updates existing tool status", () => {
    useAgentStore.getState().createSession("s1");

    useAgentStore.getState().appendChunk("s1", {
      type: "tool_use",
      sessionId: "s1",
      toolId: "tc1",
      name: "Read",
      status: "running",
    });

    useAgentStore.getState().appendChunk("s1", {
      type: "tool_use",
      sessionId: "s1",
      toolId: "tc1",
      name: "Read",
      status: "completed",
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.messages[0].toolCalls).toHaveLength(1);
    expect(session.messages[0].toolCalls![0].status).toBe("completed");
  });

  it("appendChunk with permission_request sets pendingPermission", () => {
    useAgentStore.getState().createSession("s1");

    useAgentStore.getState().appendChunk("s1", {
      type: "permission_request",
      requestId: "req1",
      toolName: "Edit",
      input: { file: "test.ts" },
    });

    const session = useAgentStore.getState().sessions.get("s1")!;
    expect(session.pendingPermission).toMatchObject({
      requestId: "req1",
      toolName: "Edit",
    });
  });

  it("setStreaming updates streaming state", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().setStreaming("s1", true);

    expect(useAgentStore.getState().sessions.get("s1")!.streaming).toBe(true);

    useAgentStore.getState().setStreaming("s1", false);
    expect(useAgentStore.getState().sessions.get("s1")!.streaming).toBe(false);
  });

  it("createSession initializes promptError as null", () => {
    useAgentStore.getState().createSession("s1");

    expect(useAgentStore.getState().sessions.get("s1")!.promptError).toBeNull();
  });

  it("setPromptError updates and clears prompt error", () => {
    useAgentStore.getState().createSession("s1");
    useAgentStore.getState().setPromptError("s1", "Quota exceeded");

    expect(useAgentStore.getState().sessions.get("s1")!.promptError).toBe("Quota exceeded");

    useAgentStore.getState().setPromptError("s1", null);
    expect(useAgentStore.getState().sessions.get("s1")!.promptError).toBeNull();
  });

  it("removeSession deletes session and clears active if needed", () => {
    useAgentStore.getState().createSession("s1");
    expect(useAgentStore.getState().activeSessionId).toBe("s1");

    useAgentStore.getState().removeSession("s1");
    expect(useAgentStore.getState().sessions.get("s1")).toBeUndefined();
    expect(useAgentStore.getState().activeSessionId).toBeNull();
  });
});
