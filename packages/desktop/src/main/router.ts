import { implement } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { type BrowserWindow, screen } from "electron";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import { projectRouter } from "./features/project/router";
import { utilsRouter } from "./features/utils/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";
import type { ProjectStore } from "./features/project/project-store";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
  projectStore: ProjectStore;
  mainWindow: BrowserWindow | null;
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
        const { mainWindow } = context;
        if (!mainWindow) return;
        const display = screen.getDisplayMatching(mainWindow.getBounds());
        const maxWidth = display.workAreaSize.width;
        const minWidth = Math.min(input.minWidth, maxWidth);
        const [currentWidth, currentHeight] = mainWindow.getSize();
        const [, currentMinHeight] = mainWindow.getMinimumSize();
        mainWindow.setMinimumSize(minWidth, currentMinHeight);
        if (currentWidth < minWidth) {
          mainWindow.setSize(minWidth, currentHeight);
        }
      }),
    },
    ...Object.fromEntries(pluginRouters),
  };
}
