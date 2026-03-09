import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import { buildRouter, type AppDependencies } from "../router";

const router = buildRouter(new Map());

describe("main router context wiring", () => {
  it("ping returns pong", async () => {
    const context = {
      sessionManager: {} as unknown as AppDependencies["sessionManager"],
      configStore: {} as unknown as AppDependencies["configStore"],
      projectStore: {} as unknown as AppDependencies["projectStore"],
      stateStore: {} as unknown as AppDependencies["stateStore"],
      mainApp: { windowManager: { mainWindow: null } } as any,
      storage: {} as unknown as AppDependencies["storage"],
    } satisfies AppDependencies;
    const result = await call(router.ping, undefined, { context });
    expect(result).toBe("pong");
  });

  it("spreads plugin routers into root", () => {
    const fakeRouter = { myHandler: vi.fn() } as any;
    const r = buildRouter(new Map([["myPlugin", fakeRouter]]));
    expect(r).toHaveProperty("myPlugin");
  });
});
