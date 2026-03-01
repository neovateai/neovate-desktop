import { implement } from "@orpc/server";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export const router = os.router({
  ping: os.ping.handler(() => "pong" as const),
  acp: acpRouter,
});
