import type { AnyRouter } from "@orpc/server";

import { implement } from "@orpc/server";

import type { StorageService } from "./core/storage-service";
import type { IMainApp } from "./core/types";
import type { SessionManager } from "./features/agent/session-manager";
import type { ConfigStore } from "./features/config/config-store";
import type { ProjectStore } from "./features/project/project-store";
import type { ProviderStore } from "./features/provider/provider-store";
import type { StateStore } from "./features/state/state-store";

import { contract } from "../shared/contract";
import { agentRouter } from "./features/agent/router";
import { configRouter } from "./features/config/router";
import { projectRouter } from "./features/project/router";
import { providerRouter } from "./features/provider/router";
import { storageRouter } from "./features/storage/router";
import { utilsRouter } from "./features/utils/router";

export type AppContext = {
  sessionManager: SessionManager;
  configStore: ConfigStore;
  providerStore: ProviderStore;
  projectStore: ProjectStore;
  stateStore: StateStore;
  mainApp: IMainApp;
  storage: StorageService;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export function buildRouter(pluginRouters: Map<string, AnyRouter>) {
  return {
    ping: os.ping.handler(() => "pong" as const),
    agent: agentRouter,
    config: configRouter,
    project: projectRouter,
    provider: providerRouter,
    storage: storageRouter,
    utils: utilsRouter,
    window: {
      ensureWidth: os.window.ensureWidth.handler(({ input, context }) => {
        context.mainApp.windowManager.ensureMinWidth(input.minWidth);
      }),
      open: os.window.open.handler(({ input, context }) => {
        context.mainApp.windowManager.open(input);
      }),
    },
    ...Object.fromEntries(pluginRouters),
  };
}
