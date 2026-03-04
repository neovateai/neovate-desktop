import { describe, it, expect, beforeEach } from "vitest";
import { useClaudeStore } from "../store";

describe("ClaudeStore", () => {
  beforeEach(() => {
    useClaudeStore.setState({
      sessions: new Map(),
      activeSessionId: null,
    });
  });

  it("creates a session and sets it active", () => {
    useClaudeStore.getState().createSession("s1");

    const state = useClaudeStore.getState();
    expect(state.sessions.get("s1")).toBeDefined();
    expect(state.activeSessionId).toBe("s1");
  });

  it("adds user message", () => {
    useClaudeStore.getState().createSession("s1");
    useClaudeStore.getState().addUserMessage("s1", "Hello");

    const session = useClaudeStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
  });

  it("appendChunk with text_delta appends text", () => {
    useClaudeStore.getState().createSession("s1");

    useClaudeStore
      .getState()
      .appendChunk("s1", { type: "text_delta", sessionId: "s1", text: "Hello " });

    useClaudeStore
      .getState()
      .appendChunk("s1", { type: "text_delta", sessionId: "s1", text: "world" });

    const session = useClaudeStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe("Hello world");
    expect(session.messages[0].role).toBe("assistant");
  });

  it("appendChunk with thinking_delta appends thinking", () => {
    useClaudeStore.getState().createSession("s1");

    useClaudeStore
      .getState()
      .appendChunk("s1", { type: "thinking_delta", sessionId: "s1", text: "thinking..." });

    const session = useClaudeStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].thinking).toBe("thinking...");
  });

  it("appendChunk with tool_use adds tool state", () => {
    useClaudeStore.getState().createSession("s1");

    useClaudeStore.getState().appendChunk("s1", {
      type: "tool_use",
      sessionId: "s1",
      toolId: "tc1",
      name: "Read file",
      status: "running",
    });

    const session = useClaudeStore.getState().sessions.get("s1")!;
    expect(session.toolCalls.get("tc1")).toMatchObject({
      toolCallId: "tc1",
      name: "Read file",
      status: "running",
    });
  });

  it("appendChunk with permission_request sets pendingPermission", () => {
    useClaudeStore.getState().createSession("s1");

    useClaudeStore.getState().appendChunk("s1", {
      type: "permission_request",
      requestId: "req1",
      toolName: "Edit",
      input: { file: "test.ts" },
    });

    const session = useClaudeStore.getState().sessions.get("s1")!;
    expect(session.pendingPermission).toMatchObject({
      requestId: "req1",
      toolName: "Edit",
    });
  });

  it("setStreaming updates streaming state", () => {
    useClaudeStore.getState().createSession("s1");
    useClaudeStore.getState().setStreaming("s1", true);

    expect(useClaudeStore.getState().sessions.get("s1")!.streaming).toBe(true);

    useClaudeStore.getState().setStreaming("s1", false);
    expect(useClaudeStore.getState().sessions.get("s1")!.streaming).toBe(false);
  });

  it("createSession initializes promptError as null", () => {
    useClaudeStore.getState().createSession("s1");

    expect(useClaudeStore.getState().sessions.get("s1")!.promptError).toBeNull();
  });

  it("setPromptError updates and clears prompt error", () => {
    useClaudeStore.getState().createSession("s1");
    useClaudeStore.getState().setPromptError("s1", "Quota exceeded");

    expect(useClaudeStore.getState().sessions.get("s1")!.promptError).toBe("Quota exceeded");

    useClaudeStore.getState().setPromptError("s1", null);
    expect(useClaudeStore.getState().sessions.get("s1")!.promptError).toBeNull();
  });

  it("removeSession deletes session and clears active if needed", () => {
    useClaudeStore.getState().createSession("s1");
    expect(useClaudeStore.getState().activeSessionId).toBe("s1");

    useClaudeStore.getState().removeSession("s1");
    expect(useClaudeStore.getState().sessions.get("s1")).toBeUndefined();
    expect(useClaudeStore.getState().activeSessionId).toBeNull();
  });
});
