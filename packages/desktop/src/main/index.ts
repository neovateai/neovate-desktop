import "./core/logger";
import { electronApp, is } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import debug from "debug";
import { app, ipcMain } from "electron";

import type { AppContext } from "./router";

import { MainApp } from "./app";
import { setupApplicationMenu } from "./core/menu";
import { SessionManager } from "./features/agent/session-manager";
import { getShellEnvironment } from "./features/agent/shell-env";
import { ConfigStore } from "./features/config/config-store";
import { ProjectStore } from "./features/project/project-store";
import { SkillsService } from "./features/skills/skills-service";
import { StateStore } from "./features/state/state-store";
import { UpdaterService } from "./features/updater/service";
import editorPlugin from "./plugins/editor";
import filesPlugin from "./plugins/files";
import gitPlugin from "./plugins/git";
import reviewPlugin from "./plugins/review";
import terminalPlugin from "./plugins/terminal";

const log = debug("neovate:orpc");

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

// Eagerly warm the shell environment cache so it's ready before first session
getShellEnvironment();

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
const sessionManager = new SessionManager(configStore, projectStore);
const stateStore = new StateStore();
const mainApp = new MainApp({
  plugins: [gitPlugin, filesPlugin, terminalPlugin, editorPlugin, reviewPlugin],
});
const updaterService = new UpdaterService();

const skillsService = new SkillsService(projectStore, configStore, process.resourcesPath);

const appContext: AppContext = {
  sessionManager,
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.neovateai.desktop");

  await mainApp.start();
  void updaterService.init();

  // Setup application menu (for menu items, shortcuts handled in renderer)
  setupApplicationMenu(mainApp.windowManager.mainWindow);

  // Transport — Electron MessagePort. Swap for WS/HTTP in other environments.
  const handler = new RPCHandler(mainApp.router);
  ipcMain.on("start-orpc-server", (event) => {
    const [serverPort] = event.ports;
    log("start-orpc-server received, upgrading message port");
    handler.upgrade(serverPort, { context: appContext });
    serverPort.start();
  });

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
  updaterService.dispose();
  void sessionManager.closeAll();
  void mainApp.stop();
});
