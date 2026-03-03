import { implement } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import { projectRouter } from "./features/project/router";
import { utilsRouter } from "./features/utils/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";
import type { ProjectStore } from "./features/project/project-store";
import type { IMainApp } from "./core/types";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
  projectStore: ProjectStore;
  mainApp: IMainApp;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export function buildRouter(pluginRouters: Map<string, AnyRouter>) {
  return {
    ping: os.ping.handler(() => "pong" as const),
    acp: acpRouter,
    project: projectRouter,
    utils: utilsRouter,
    window: {
      ensureWidth: os.window.ensureWidth.handler(({ input, context }) => {
        context.mainApp.windowManager.ensureMinWidth(input.minWidth);
      }),
    },
    ...Object.fromEntries(pluginRouters),
  };
}
