import { app, ipcMain } from "electron";
import { electronApp, is } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import debug from "debug";
import { SessionManager } from "./features/agent/session-manager";
import { getShellEnvironment } from "./features/agent/shell-env";
import { ConfigStore } from "./features/config/config-store";
import { ProjectStore } from "./features/project/project-store";
import { StateStore } from "./features/state/state-store";
import { MainApp } from "./app";
import type { AppContext } from "./router";
import gitPlugin from "./plugins/git";
import filesPlugin from "./plugins/files";
import terminalPlugin from "./plugins/terminal";
import editorPlugin from "./plugins/editor";
import { setupApplicationMenu } from "./core/menu";

const log = debug("neovate:orpc");

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

// Eagerly warm the shell environment cache so it's ready before first session
getShellEnvironment();

const sessionManager = new SessionManager();
const configStore = new ConfigStore();
const projectStore = new ProjectStore();
const stateStore = new StateStore();
const mainApp = new MainApp({
  plugins: [gitPlugin, filesPlugin, terminalPlugin, editorPlugin],
});

const appContext: AppContext = {
  sessionManager,
  configStore,
  projectStore,
  stateStore,
  mainApp,
  storage: mainApp.getStorage(),
};

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  await mainApp.start();

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
  void mainApp.stop();
});
