import { describe, it, expect, vi } from "vitest";
import { call } from "@orpc/server";
import { agentRouter } from "../router";
import type { SessionManager } from "../session-manager";
import type { AppContext } from "../../../router";

function makeContext(overrides?: Partial<AppContext>): AppContext {
  return {
    sessionManager: {
      listSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({ sessionId: "s1" }),
      resolvePermission: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      renameSession: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn(),
      closeAll: vi.fn(),
    } as unknown as SessionManager,
    configStore: {} as any,
    projectStore: {} as any,
    mainApp: { windowManager: { mainWindow: null } } as any,
    storage: {} as any,
    stateStore: {} as any,
    ...overrides,
  };
}

describe("agentRouter", () => {
  it("listSessions delegates to sessionManager", async () => {
    const context = makeContext();
    const result = await call(agentRouter.listSessions, { cwd: "/test" }, { context });
    expect(result).toEqual([]);
    expect(context.sessionManager.listSessions).toHaveBeenCalledWith("/test");
  });

  it("newSession delegates to sessionManager.createSession", async () => {
    const context = makeContext();
    const result = await call(agentRouter.newSession, { cwd: "/test" }, { context });
    expect(result).toEqual({ sessionId: "s1" });
    expect(context.sessionManager.createSession).toHaveBeenCalledWith("/test", undefined);
  });

  it("resolvePermission delegates to sessionManager", async () => {
    const context = makeContext();
    await call(agentRouter.resolvePermission, { requestId: "r1", allow: true }, { context });
    expect(context.sessionManager.resolvePermission).toHaveBeenCalledWith("r1", true);
  });

  it("cancel delegates to sessionManager", async () => {
    const context = makeContext();
    await call(agentRouter.cancel, { sessionId: "s1" }, { context });
    expect(context.sessionManager.cancel).toHaveBeenCalledWith("s1");
  });
});
