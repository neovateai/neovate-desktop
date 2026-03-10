import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../orpc", () => ({
  client: {
    agent: {
      renameSession: vi.fn(),
    },
  },
}));

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

  it("removeSession deletes session and clears active if needed", () => {
    useAgentStore.getState().createSession("s1");
    expect(useAgentStore.getState().activeSessionId).toBe("s1");

    useAgentStore.getState().removeSession("s1");
    expect(useAgentStore.getState().sessions.get("s1")).toBeUndefined();
    expect(useAgentStore.getState().activeSessionId).toBeNull();
  });
});
