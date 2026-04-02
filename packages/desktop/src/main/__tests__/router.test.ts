import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import { RequestTracker } from "../features/agent/request-tracker";
import { buildRouter, type AppDependencies } from "../router";

const router = buildRouter([]);

describe("main router context wiring", () => {
  it("ping returns pong", async () => {
    const context = {
      sessionManager: {} as unknown as AppDependencies["sessionManager"],
      requestTracker: new RequestTracker(),
      configStore: {} as unknown as AppDependencies["configStore"],
      projectStore: {} as unknown as AppDependencies["projectStore"],
      pluginsService: {} as unknown as AppDependencies["pluginsService"],
      skillsService: {} as unknown as AppDependencies["skillsService"],
      stateStore: {} as unknown as AppDependencies["stateStore"],
      updaterService: {} as unknown as AppDependencies["updaterService"],
      llmService: {} as unknown as AppDependencies["llmService"],
      mainApp: { windowManager: { mainWindow: null } } as any,
      storage: {} as unknown as AppDependencies["storage"],
    } satisfies AppDependencies;
    const result = await call(router.ping, undefined, { context });
    expect(result).toBe("pong");
  });

  it("spreads plugin routers into root", () => {
    const fakeRouter = { myHandler: vi.fn() } as any;
    const r = buildRouter([{ plugin: { name: "myPlugin" }, value: fakeRouter }]);
    expect(r).toHaveProperty("myPlugin");
  });
});
