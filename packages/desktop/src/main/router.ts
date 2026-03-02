import { implement } from "@orpc/server";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import { projectRouter } from "./features/project/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";
import type { ProjectStore } from "./features/project/project-store";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
  projectStore: ProjectStore;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export const router = os.router({
  ping: os.ping.handler(() => "pong" as const),
  acp: acpRouter,
  project: projectRouter,
});
