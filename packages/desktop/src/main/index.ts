import { app, ipcMain } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import debug from "debug";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import { ProjectStore } from "./features/project/project-store";
import { MainApp } from "./app";
import type { AppContext } from "./router";
import gitPlugin from "./plugins/git";

const log = debug("neovate:orpc");

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

const connectionManager = new AcpConnectionManager();
const projectStore = new ProjectStore();
const appContext: AppContext = {
  acpConnectionManager: connectionManager,
  projectStore,
};

const mainApp = new MainApp({
  plugins: [gitPlugin],
});

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await mainApp.start();

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
