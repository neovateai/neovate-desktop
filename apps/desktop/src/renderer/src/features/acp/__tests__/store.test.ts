import { describe, it, expect, beforeEach } from "vitest";
import { useAcpStore } from "../store";

describe("AcpStore", () => {
  beforeEach(() => {
    // Reset store state
    useAcpStore.setState({
      agents: [],
      sessions: new Map(),
      activeSessionId: null,
    });
  });

  it("creates a session and sets it active", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    const state = useAcpStore.getState();
    expect(state.sessions.get("s1")).toBeDefined();
    expect(state.activeSessionId).toBe("s1");
  });

  it("adds user message", () => {
    useAcpStore.getState().createSession("s1", "conn1");
    useAcpStore.getState().addUserMessage("s1", "Hello");

    const session = useAcpStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
  });

  it("appendChunk with agent_message_chunk appends text", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    useAcpStore.getState().appendChunk("s1", {
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello " },
        },
      },
    });

    useAcpStore.getState().appendChunk("s1", {
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "world" },
        },
      },
    });

    const session = useAcpStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe("Hello world");
    expect(session.messages[0].role).toBe("assistant");
  });

  it("appendChunk with agent_thought_chunk appends thinking", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    useAcpStore.getState().appendChunk("s1", {
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "thinking..." },
        },
      },
    });

    const session = useAcpStore.getState().sessions.get("s1")!;
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].thinking).toBe("thinking...");
  });

  it("appendChunk with tool_call adds tool state", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    useAcpStore.getState().appendChunk("s1", {
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc1",
          title: "Read file",
          kind: "read",
          status: "pending",
        },
      },
    });

    const session = useAcpStore.getState().sessions.get("s1")!;
    expect(session.toolCalls.get("tc1")).toMatchObject({
      toolCallId: "tc1",
      title: "Read file",
      status: "pending",
    });
  });

  it("appendChunk with tool_call_update updates existing tool", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    useAcpStore.getState().appendChunk("s1", {
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc1",
          title: "Read file",
          kind: "read",
          status: "pending",
        },
      },
    });

    useAcpStore.getState().appendChunk("s1", {
      type: "update",
      data: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc1",
          status: "completed",
        },
      },
    });

    const session = useAcpStore.getState().sessions.get("s1")!;
    expect(session.toolCalls.get("tc1")?.status).toBe("completed");
  });

  it("appendChunk with permission_request sets pendingPermission", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    useAcpStore.getState().appendChunk("s1", {
      type: "permission_request",
      requestId: "req1",
      data: {
        sessionId: "s1",
        toolCall: {
          toolCallId: "tc1",
          title: "Edit file",
          kind: "edit",
          status: "pending",
        },
        options: [{ kind: "allow_once", name: "Allow", optionId: "allow" }],
      },
    });

    const session = useAcpStore.getState().sessions.get("s1")!;
    expect(session.pendingPermission).toMatchObject({
      requestId: "req1",
    });
  });

  it("setStreaming updates streaming state", () => {
    useAcpStore.getState().createSession("s1", "conn1");
    useAcpStore.getState().setStreaming("s1", true);

    expect(useAcpStore.getState().sessions.get("s1")!.streaming).toBe(true);

    useAcpStore.getState().setStreaming("s1", false);
    expect(useAcpStore.getState().sessions.get("s1")!.streaming).toBe(false);
  });

  it("createSession initializes promptError as null", () => {
    useAcpStore.getState().createSession("s1", "conn1");

    expect(useAcpStore.getState().sessions.get("s1")!.promptError).toBeNull();
  });

  it("setPromptError updates and clears prompt error", () => {
    useAcpStore.getState().createSession("s1", "conn1");
    useAcpStore.getState().setPromptError("s1", "Quota exceeded");

    expect(useAcpStore.getState().sessions.get("s1")!.promptError).toBe("Quota exceeded");

    useAcpStore.getState().setPromptError("s1", null);
    expect(useAcpStore.getState().sessions.get("s1")!.promptError).toBeNull();
  });

  it("removeSession deletes session and clears active if needed", () => {
    useAcpStore.getState().createSession("s1", "conn1");
    expect(useAcpStore.getState().activeSessionId).toBe("s1");

    useAcpStore.getState().removeSession("s1");
    expect(useAcpStore.getState().sessions.get("s1")).toBeUndefined();
    expect(useAcpStore.getState().activeSessionId).toBeNull();
  });
});
