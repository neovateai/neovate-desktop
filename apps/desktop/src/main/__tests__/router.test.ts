import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { router, type AppDependencies } from "../router";

describe("main router context wiring", () => {
  it("uses ORPC context dependencies for each call", async () => {
    const contextA = {
      acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
      acpAgentRegistry: {
        getAll: () => [
          {
            id: "agent-a",
            name: "Agent A",
            command: "echo",
            args: [],
          },
        ],
      } as unknown as AppDependencies["acpAgentRegistry"],
    } satisfies AppDependencies;

    const contextB = {
      acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
      acpAgentRegistry: {
        getAll: () => [
          {
            id: "agent-b",
            name: "Agent B",
            command: "echo",
            args: [],
          },
        ],
      } as unknown as AppDependencies["acpAgentRegistry"],
    } satisfies AppDependencies;

    const fromA = await call(router.acp.listAgents, undefined, { context: contextA });
    const fromB = await call(router.acp.listAgents, undefined, { context: contextB });

    expect(fromA).toEqual(contextA.acpAgentRegistry.getAll());
    expect(fromB).toEqual(contextB.acpAgentRegistry.getAll());
  });
});
