import { call } from "@orpc/server";
import { describe, it, expect, vi } from "vitest";

import type { AppContext } from "../../../router";
import type { SessionManager } from "../session-manager";

import { RequestTracker } from "../request-tracker";
import { agentRouter } from "../router";

function makeContext(overrides?: Partial<AppContext>): AppContext {
  return {
    sessionManager: {
      listSessions: vi.fn().mockResolvedValue([]),
      renameSession: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn(),
      closeAll: vi.fn(),
    } as unknown as SessionManager,
    requestTracker: new RequestTracker(),
    configStore: {} as any,
    projectStore: { getSessionStartTimes: vi.fn().mockReturnValue({}) } as any,
    mainApp: { windowManager: { mainWindow: null } } as any,
    storage: {} as any,
    skillsService: {} as any,
    stateStore: {} as any,
    updaterService: {} as any,
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

  it("renameSession delegates to sessionManager", async () => {
    const context = makeContext();
    await call(agentRouter.renameSession, { sessionId: "s1", title: "new title" }, { context });
    expect(context.sessionManager.renameSession).toHaveBeenCalledWith("s1", "new title");
  });
});
