import "./core/logger";
import { electronApp, is } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import debug from "debug";
import { app, ipcMain, BrowserWindow } from "electron";

import type { AppContext } from "./router";

import { APP_NAME } from "../shared/constants";
import { MainApp } from "./app";
import { ApplicationMenu } from "./core/menu";
import { PowerBlockerService } from "./core/power-blocker-service";
import { shellEnvService } from "./core/shell-service";
import { RequestTracker } from "./features/agent/request-tracker";
import { SessionManager } from "./features/agent/session-manager";
import { ConfigStore } from "./features/config/config-store";
import { ProjectStore } from "./features/project/project-store";
import { SkillsService } from "./features/skills/skills-service";
import { StateStore } from "./features/state/state-store";
import { UpdaterService } from "./features/updater/service";
import changesPlugin from "./plugins/changes";
import editorPlugin from "./plugins/editor";
import filesPlugin from "./plugins/files";
import gitPlugin from "./plugins/git";
import terminalPlugin from "./plugins/terminal";

const log = debug("neovate:orpc");
const startupLog = debug("neovate:startup");
const t0 = performance.now();
const elapsed = () => `${Math.round(performance.now() - t0)}ms`;
startupLog("main process module loaded %s", elapsed());

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

// Eagerly warm the shell environment cache so it's ready before first session
shellEnvService.getEnv();

const configStore = new ConfigStore();
const projectStore = new ProjectStore();

// --- Crash loop detection (Section 1) ---
if (projectStore.checkCrashLoop()) {
  log("crash loop detected — clearing activeProjectId to break the loop");
  projectStore.setActive(null);
  projectStore.clearCrashCounter();
}

process.on("uncaughtException", (error) => {
  log("uncaughtException: %O", error);
  projectStore.recordCrash();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("unhandledRejection: %O", reason);
  projectStore.recordCrash();
  process.exit(1);
});
const requestTracker = new RequestTracker();
const powerBlocker = new PowerBlockerService(configStore);
const sessionManager = new SessionManager(configStore, projectStore, requestTracker, powerBlocker);
const stateStore = new StateStore();
const mainApp = new MainApp({
  plugins: [gitPlugin, filesPlugin, terminalPlugin, editorPlugin, changesPlugin],
});
const updaterService = new UpdaterService();

const skillsService = new SkillsService(projectStore, configStore, process.resourcesPath);

const appContext: AppContext = {
  sessionManager,
  requestTracker,
  configStore,
  projectStore,
  skillsService,
  stateStore,
  updaterService,
  mainApp,
  storage: mainApp.getStorage(),
};

// Reset crash counter after 30s of stable uptime
setTimeout(() => projectStore.clearCrashCounter(), 30_000);

// ── Deeplink protocol registration ──
const deeplinkScheme = `${APP_NAME.toLowerCase()}${is.dev ? "-dev" : ""}`;
app.setAsDefaultProtocolClient(deeplinkScheme);

function parseDeeplinkUrl(url: string): { sessionId: string; project: string } | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/?\/?session\/(.+)/);
    if (!match) return null;
    const sessionId = match[1];
    const project = parsed.searchParams.get("project");
    if (!sessionId || !project) return null;
    return { sessionId, project: decodeURIComponent(project) };
  } catch {
    return null;
  }
}

let pendingDeeplink: { sessionId: string; project: string } | null = null;

app.on("open-url", (event, url) => {
  event.preventDefault();
  const parsed = parseDeeplinkUrl(url);
  if (!parsed) return;
  startupLog("open-url: %o", parsed);

  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.show();
    win.focus();
    win.webContents.send("deeplink", parsed);
  } else {
    pendingDeeplink = parsed;
  }
});

let menu: ApplicationMenu | null = null;

startupLog("app.whenReady waiting %s", elapsed());
app.whenReady().then(async () => {
  startupLog("app.whenReady fired %s", elapsed());
  electronApp.setAppUserModelId("com.neovateai.desktop");

  await mainApp.start();
  startupLog("mainApp.start done %s", elapsed());
  void updaterService.init();

  // Setup application menu (for menu items, shortcuts handled in renderer)
  menu = new ApplicationMenu(updaterService);

  // Transport — Electron MessagePort. Swap for WS/HTTP in other environments.
  const handler = new RPCHandler(mainApp.router);
  ipcMain.on("start-orpc-server", (event) => {
    const [serverPort] = event.ports;
    log("start-orpc-server received, upgrading message port");
    handler.upgrade(serverPort, { context: appContext });
    serverPort.start();
  });

  // Flush any buffered deeplink once renderer is ready
  if (pendingDeeplink) {
    const win = mainApp.windowManager.mainWindow;
    if (win) {
      win.webContents.once("did-finish-load", () => {
        if (pendingDeeplink) {
          win.webContents.send("deeplink", pendingDeeplink);
          pendingDeeplink = null;
        }
      });
    }
  }

  app.on("activate", () => {
    const win = mainApp.windowManager.mainWindow;
    if (!win) {
      mainApp.windowManager.createMainWindow();
    } else {
      win.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  menu?.dispose();
  updaterService.dispose();
  powerBlocker.dispose();
  void sessionManager.closeAll();
  void mainApp.stop();
});
