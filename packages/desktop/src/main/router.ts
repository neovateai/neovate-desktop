import { implement } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { contract } from "../shared/contract";
import { agentRouter } from "./features/agent/router";
import { configRouter } from "./features/config/router";
import { projectRouter } from "./features/project/router";
import { utilsRouter } from "./features/utils/router";
import type { SessionManager } from "./features/agent/session-manager";
import type { ConfigStore } from "./features/config/config-store";
import type { ProjectStore } from "./features/project/project-store";
import type { IMainApp } from "./core/types";

export type AppContext = {
  sessionManager: SessionManager;
  configStore: ConfigStore;
  projectStore: ProjectStore;
  mainApp: IMainApp;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export function buildRouter(pluginRouters: Map<string, AnyRouter>) {
  return {
    ping: os.ping.handler(() => "pong" as const),
    agent: agentRouter,
    config: configRouter,
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
