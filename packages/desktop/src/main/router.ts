import { implement } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import { configRouter } from "./features/config/router";
import { projectRouter } from "./features/project/router";
import { stateRouter } from "./features/state/router";
import { utilsRouter } from "./features/utils/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";
import type { ConfigStore } from "./features/config/config-store";
import type { ProjectStore } from "./features/project/project-store";
import type { StateStore } from "./features/state/state-store";
import type { IMainApp } from "./core/types";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
  configStore: ConfigStore;
  projectStore: ProjectStore;
  stateStore: StateStore;
  mainApp: IMainApp;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export function buildRouter(pluginRouters: Map<string, AnyRouter>) {
  return {
    ping: os.ping.handler(() => "pong" as const),
    acp: acpRouter,
    config: configRouter,
    project: projectRouter,
    state: stateRouter,
    utils: utilsRouter,
    window: {
      ensureWidth: os.window.ensureWidth.handler(({ input, context }) => {
        context.mainApp.windowManager.ensureMinWidth(input.minWidth);
      }),
    },
    ...Object.fromEntries(pluginRouters),
  };
}
