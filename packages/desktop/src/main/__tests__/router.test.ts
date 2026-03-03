import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { buildRouter, type AppDependencies } from "../router";

const router = buildRouter(new Map());

describe("main router context wiring", () => {
  it("listAgents returns built-in agents from acp registry", async () => {
    const context = {
      acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
      configStore: {} as unknown as AppDependencies["configStore"],
      projectStore: {} as unknown as AppDependencies["projectStore"],
    } satisfies AppDependencies;

    const agents = await call(router.acp.listAgents, undefined, { context });

    expect(agents).toBeInstanceOf(Array);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent).toHaveProperty("id");
      expect(agent).toHaveProperty("name");
    }
  });

  it("ping returns pong", async () => {
    const context = {
      acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
      configStore: {} as unknown as AppDependencies["configStore"],
      projectStore: {} as unknown as AppDependencies["projectStore"],
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
