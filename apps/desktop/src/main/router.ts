import { implement } from "@orpc/server";
import { contract } from "../shared/contract";
import { createAcpRouter } from "./features/acp/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";
import type { AgentRegistry } from "./features/acp/agent-registry";

export type AppDependencies = {
  acpConnectionManager: AcpConnectionManager;
  acpAgentRegistry: AgentRegistry;
};

const os = implement(contract);

export function createRouter(deps: AppDependencies) {
  return os.router({
    ping: os.ping.handler(() => "pong" as const),
    acp: createAcpRouter(deps.acpConnectionManager, deps.acpAgentRegistry),
  });
}
