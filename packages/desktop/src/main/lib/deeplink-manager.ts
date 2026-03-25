import type { App } from "electron";

import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type {
  DeepLinkActionEvent,
  DeepLinkOpenRequest,
  DeepLinkProjectReadyAck,
} from "../../shared/features/electron/deeplink";
import type { MainApp } from "../app";
import type { ProjectStore } from "../features/project/project-store";

import { openProjectByPath } from "../features/project/open-project";
import { NEO_PROTOCOL, parseDeepLink, resolveDeepLinkIntent } from "./deeplink";
import { createDeepLinkRuntime } from "./deeplink-runtime";

type DeepLinkManagerOptions = {
  app: App;
  mainApp: MainApp;
  projectStore: ProjectStore;
  log?: (event: string, meta?: Record<string, unknown>) => void;
};

export function createDeepLinkManager(options: DeepLinkManagerOptions) {
  let activeOpenRequest: {
    request: DeepLinkOpenRequest;
    resolve: (action: DeepLinkActionEvent | null) => void;
  } | null = null;

  const log = (event: string, meta?: Record<string, unknown>) => {
    options.log?.(event, meta);
  };

  const ensureMainWindowVisible = () => {
    const win =
      options.mainApp.windowManager.mainWindow ?? options.mainApp.windowManager.createMainWindow();
    if ("isMinimized" in win && typeof win.isMinimized === "function" && win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
    return win;
  };

  const isAccessibleProjectDirectory = (projectPath: string): boolean => {
    if (!existsSync(projectPath)) {
      return false;
    }

    try {
      return statSync(projectPath).isDirectory();
    } catch {
      return false;
    }
  };

  const sendToMainWindow = (channel: string, payload: unknown): void => {
    const win = options.mainApp.windowManager.mainWindow;
    if (!win || win.isDestroyed()) {
      return;
    }

    const deliver = () => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    };

    if (win.webContents.isLoadingMainFrame()) {
      win.webContents.once("did-finish-load", deliver);
      return;
    }

    deliver();
  };

  const dispatchOpenRequest = (request: DeepLinkOpenRequest | null): void => {
    if (!request) {
      return;
    }

    sendToMainWindow("deeplink:request-open", request);
  };

  const dispatchAction = (action: DeepLinkActionEvent | null): void => {
    if (!action) {
      return;
    }

    sendToMainWindow("deeplink:action", action);
  };

  const handleDeepLink = async (urlText: string): Promise<void> => {
    const parsed = parseDeepLink(urlText);
    if (!parsed) {
      log("ignored_url", { reason: "unsupported", urlText });
      return;
    }

    const intent = resolveDeepLinkIntent(parsed);
    if (!intent) {
      log("ignored_action", { action: parsed.action, urlText });
      return;
    }

    if (!isAccessibleProjectDirectory(intent.projectPath)) {
      log("ignored_project", { projectPath: intent.projectPath, reason: "inaccessible" });
      return;
    }

    ensureMainWindowVisible();
    openProjectByPath(options.projectStore, intent.projectPath);
    const request: DeepLinkOpenRequest = {
      id: randomUUID(),
      ...intent,
    };

    await new Promise<void>((resolve) => {
      activeOpenRequest = {
        request,
        resolve: () => resolve(),
      };
      dispatchOpenRequest(request);
    });
  };

  const runtime = createDeepLinkRuntime({
    handle: handleDeepLink,
    log: (event, meta) => {
      log(`runtime_${event}`, meta);
    },
  });

  return {
    registerProtocol(): void {
      if (process.defaultApp && process.argv.length >= 2) {
        options.app.setAsDefaultProtocolClient(NEO_PROTOCOL, process.execPath, [
          path.resolve(process.argv[1]),
        ]);
        return;
      }

      options.app.setAsDefaultProtocolClient(NEO_PROTOCOL);
    },

    ensureMainWindowVisible,

    receive(url: string): Promise<void> {
      return runtime.receive(url);
    },

    markReady(): Promise<void> {
      return runtime.markReady();
    },

    confirmProjectReady(ack: DeepLinkProjectReadyAck): DeepLinkActionEvent | null {
      if (!activeOpenRequest) {
        log("ignored_ack", { reason: "missing_request", ack });
        return null;
      }

      const { request, resolve } = activeOpenRequest;
      if (request.id !== ack.id || request.projectPath !== ack.projectPath) {
        log("ignored_ack", {
          reason: "mismatch",
          ack,
          request: {
            id: request.id,
            projectPath: request.projectPath,
          },
        });
        return null;
      }

      const action: DeepLinkActionEvent = request;
      activeOpenRequest = null;
      dispatchAction(action);
      resolve(action);
      return action;
    },
  };
}
