import { describe, it, expect, vi } from "vitest";
import { call } from "@orpc/server";
import { claudeRouter } from "../router";
import type { SessionManager } from "../session-manager";
import type { AppContext } from "../../../router";

function makeContext(overrides?: Partial<AppContext>): AppContext {
  return {
    sessionManager: {
      listSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({ sessionId: "s1" }),
      resolvePermission: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn(),
      closeAll: vi.fn(),
    } as unknown as SessionManager,
    configStore: {} as any,
    projectStore: {} as any,
    mainApp: { windowManager: { mainWindow: null } } as any,
    ...overrides,
  };
}

describe("claudeRouter", () => {
  it("listSessions delegates to sessionManager", async () => {
    const context = makeContext();
    const result = await call(claudeRouter.listSessions, { cwd: "/test" }, { context });
    expect(result).toEqual([]);
    expect(context.sessionManager.listSessions).toHaveBeenCalledWith("/test");
  });

  it("newSession delegates to sessionManager.createSession", async () => {
    const context = makeContext();
    const result = await call(claudeRouter.newSession, { cwd: "/test" }, { context });
    expect(result).toEqual({ sessionId: "s1" });
    expect(context.sessionManager.createSession).toHaveBeenCalledWith("/test", undefined);
  });

  it("resolvePermission delegates to sessionManager", async () => {
    const context = makeContext();
    await call(claudeRouter.resolvePermission, { requestId: "r1", allow: true }, { context });
    expect(context.sessionManager.resolvePermission).toHaveBeenCalledWith("r1", true);
  });

  it("cancel delegates to sessionManager", async () => {
    const context = makeContext();
    await call(claudeRouter.cancel, { sessionId: "s1" }, { context });
    expect(context.sessionManager.cancel).toHaveBeenCalledWith("s1");
  });
});
