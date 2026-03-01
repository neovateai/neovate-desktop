import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { router, type AppDependencies } from "../router";

describe("main router context wiring", () => {
  it("listAgents returns built-in agents from acpx registry", async () => {
    const context = {
      acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
    } satisfies AppDependencies;

    const agents = await call(router.acp.listAgents, undefined, { context });

    expect(agents).toBeInstanceOf(Array);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent).toHaveProperty("id");
      expect(agent).toHaveProperty("name");
    }
  });
});
