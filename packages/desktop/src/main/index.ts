import "./core/logger";
import { electronApp, is } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import debug from "debug";
import { app, ipcMain, BrowserWindow } from "electron";

import type { AppContext } from "./router";

import { isMac } from "../shared/platform";
import { MainApp } from "./app";
import { ApplicationMenu } from "./core/menu";
import { PowerBlockerService } from "./core/power-blocker-service";
import { shellEnvService } from "./core/shell-service";
import { RequestTracker } from "./features/agent/request-tracker";
import { SessionManager } from "./features/agent/session-manager";
import { PluginsService } from "./features/claude-code-plugins/plugins-service";
import { ConfigStore } from "./features/config/config-store";
import { LlmService } from "./features/llm/llm-service";
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

// Each SDK session adds a process.on("exit") listener to kill its child process.
// Raise the limit so normal multi-session usage doesn't trigger a warning.
process.setMaxListeners(50);

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

// Ensure the playground project + directory exist (idempotent)
projectStore.ensurePlayground();

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
const sessionManager = new SessionManager(
  configStore,
  projectStore,
  requestTracker,
  powerBlocker,
  () => mainApp.pluginManager.contributions.agents,
);
const stateStore = new StateStore();
const llmService = new LlmService(configStore, shellEnvService);
const mainApp = new MainApp({
  appName: app.getName(),
  plugins: [gitPlugin, filesPlugin, terminalPlugin, editorPlugin, changesPlugin],
  llmService,
});
const updaterService = new UpdaterService({
  onBeforeQuitForUpdate: () => mainApp.windowManager.prepareForQuit(),
});
const pluginsService = new PluginsService();
const skillsService = new SkillsService(projectStore, configStore, process.resourcesPath);

const appContext: AppContext = {
  sessionManager,
  requestTracker,
  configStore,
  llmService,
  projectStore,
  pluginsService,
  skillsService,
  stateStore,
  updaterService,
  mainApp,
  storage: mainApp.getStorage(),
};

// Reset crash counter after 30s of stable uptime
setTimeout(() => projectStore.clearCrashCounter(), 30_000);

// ── Deeplink ──
// open-url at module level — critical for cold launch on macOS
app.on("open-url", (event, url) => {
  event.preventDefault();
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.show();
    win.focus();
  }
  mainApp.deeplink.handle(url);
});

// Register app-level deeplink handler before start()
mainApp.deeplink.register("session", {
  handle(ctx) {
    const sessionId = ctx.path.slice(1); // remove leading /
    const project = ctx.searchParams.get("project");
    if (!sessionId || !project) return null;
    // searchParams.get() already decodes — do not double-decode
    return { sessionId, project };
  },
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

  app.on("activate", () => {
    const win = mainApp.windowManager.mainWindow;
    if (!win) {
      mainApp.windowManager.createMainWindow();
    } else {
      win.show();
    }
  });

  // Cleanup handler — registered after mainApp.start() so the BWM's
  // quit-confirmation before-quit handler fires first (Electron preserves
  // listener registration order). The e.defaultPrevented guard ensures
  // cleanup only runs when the quit is actually proceeding.
  app.on("before-quit", (e) => {
    if (e.defaultPrevented) return;

    const qt0 = performance.now();
    const qel = (label: string) =>
      startupLog("QUIT %s %dms", label, Math.round(performance.now() - qt0));

    startupLog("QUIT before-quit fired");

    menu?.dispose();
    qel("menu.dispose");

    updaterService.dispose();
    qel("updaterService.dispose");

    powerBlocker.dispose();
    qel("powerBlocker.dispose");

    llmService.dispose();
    qel("llmService.dispose");

    const sessCount = sessionManager.getActiveSessions().length;
    startupLog("QUIT closing %d sessions", sessCount);

    void sessionManager.closeAll().then(() => qel("sessionManager.closeAll DONE"));
    void mainApp.stop().then(() => qel("mainApp.stop DONE"));
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
