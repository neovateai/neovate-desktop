# Main App & Plugin System Design

## Goal

Redesign the Electron main process to mirror the renderer plugin system pattern:
- `MainApp` class owns plugin lifecycle and IPC wiring
- `BrowserWindowManager` manages window creation, tracking, and teardown
- `PluginManager` collects plugin contributions and runs lifecycle hooks
- Electron process events (`app.whenReady`, `app.on(...)`) live in `index.ts`, not inside `MainApp`

## Non-Goals

- Migrating `acp` to a plugin (stays as a built-in feature, hard-wired in router)
- Plugin sandboxing (same process, full Node.js/Electron access)
- Hot reload

## File Structure

```
src/main/
├── core/
│   ├── types.ts              # MainPlugin, IMainApp, IBrowserWindowManager, PluginContext, AppContext, etc.
│   ├── plugin-manager.ts     # PluginManager class
│   ├── disposable.ts         # DisposableStore (mirrors renderer)
│   └── index.ts              # barrel export (public SDK surface)
├── app.ts                    # MainApp class (mirrors RendererApp)
├── browser-window-manager.ts # BrowserWindowManager class
├── router.ts                 # buildRouter(pluginRouters) — acp + ping hard-wired
├── features/acp/             # unchanged
├── plugins/system-info/      # example plugin
└── index.ts                  # thin entry: Electron events + new MainApp(...).start()
```

## Core Types

```typescript
// core/types.ts
import type { AnyRouter } from "@orpc/server";
import type { BrowserWindow } from "electron";
import type { AcpConnectionManager } from "../features/acp/connection-manager";
import type { Disposable } from "./disposable";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

export interface OpenWindowOptions {
  /** Unique window ID — re-focuses existing window if already open */
  windowId: string;
  /** Passed to renderer via URL param — renderer uses this to decide what to render */
  windowType: string;
  width?: number;
  height?: number;
  title?: string;
  /** If true, uses the main window as the parent (modal-style) */
  parent?: boolean;
  /** Additional URL search params passed to the renderer */
  urlSearchParams?: Record<string, string>;
}

export interface IBrowserWindowManager {
  readonly mainWindow: BrowserWindow | null;
  createMainWindow(): BrowserWindow;
  open(options: OpenWindowOptions): void;
  close(windowId: string): void;
}

/** Abstract app interface — plugins depend on this, MainApp implements it */
export interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
}

export interface PluginContext {
  app: IMainApp;
}

export interface MainPluginContributions {
  router?: AnyRouter;
}

export interface MainPluginHooks {
  configContributions(ctx: PluginContext): MainPluginContributions | Promise<MainPluginContributions>;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate(): void | Promise<void>;
}

export type MainPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<MainPluginHooks>;
```

Key decisions:
- `PluginContext = { app: IMainApp }` — exact mirror of renderer's `{ app: IRendererApp }`
- `IMainApp` exposes `subscriptions` and `windowManager` — plugins can register cleanup and open windows
- `IBrowserWindowManager` is an interface in `core/types.ts` so `IMainApp` can reference it without circular deps
- `AppContext` is internal — used by `MainApp` to wire built-in acp router, never exposed to plugins via `IMainApp`
- `AnyRouter` instead of `Router<any, any>` — uses oRPC's own escape hatch type (`type AnyRouter = Router<any, any>`)

## BrowserWindowManager

Manages all `BrowserWindow` instances: the primary main window and any secondary windows opened by plugins or the app itself.

```typescript
// browser-window-manager.ts
import { join } from "path";
import { shell, BrowserWindow } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import type { IBrowserWindowManager, OpenWindowOptions } from "./core/types";

export class BrowserWindowManager implements IBrowserWindowManager {
  #mainWindow: BrowserWindow | null = null;
  #windows = new Map<string, BrowserWindow>();

  get mainWindow(): BrowserWindow | null {
    return this.#mainWindow;
  }

  /** Create the primary app window */
  createMainWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      ...(process.platform === "linux" ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
      },
    });

    win.on("ready-to-show", () => win.show());

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      win.loadFile(join(__dirname, "../renderer/index.html"));
    }

    win.on("closed", () => {
      this.#mainWindow = null;
    });

    this.#mainWindow = win;
    return win;
  }

  /**
   * Open a secondary window by ID.
   * If a window with the same ID is already open and not destroyed, focuses it instead.
   * The renderer reads `windowType` from URL params to decide what to render.
   */
  open(options: OpenWindowOptions): void {
    const { windowId, windowType, width = 800, height = 600, title, parent = false } = options;

    const existing = this.#windows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }
    if (existing) this.#windows.delete(windowId);

    const win = new BrowserWindow({
      width,
      height,
      title: title ?? windowId,
      show: false,
      ...(parent && this.#mainWindow ? { parent: this.#mainWindow } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
      },
    });

    win.on("ready-to-show", () => win.show());

    const params = new URLSearchParams({
      windowId,
      windowType,
      ...options.urlSearchParams,
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const url = new URL(process.env["ELECTRON_RENDERER_URL"]);
      url.search = params.toString();
      win.loadURL(url.toString());
    } else {
      win.loadFile(join(__dirname, "../renderer/index.html"), {
        search: params.toString(),
      });
    }

    win.on("closed", () => this.#windows.delete(windowId));
    win.webContents.on("did-fail-load", () => {
      this.#windows.delete(windowId);
      if (!win.isDestroyed()) win.close();
    });

    this.#windows.set(windowId, win);
  }

  /** Close a secondary window by ID */
  close(windowId: string): void {
    const win = this.#windows.get(windowId);
    if (win && !win.isDestroyed()) win.close();
  }

  /** Destroy all windows — called on app quit */
  destroyAll(): void {
    if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      this.#mainWindow.destroy();
      this.#mainWindow = null;
    }
    for (const win of this.#windows.values()) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.#windows.clear();
  }
}
```

### Plugin usage example

A plugin that opens a settings window from an IPC handler:

```typescript
// plugins/settings/index.ts
export default {
  name: "settings",
  activate({ app }) {
    ipcMain.on("open-settings", () => {
      app.windowManager.open({
        windowId: "settings",
        windowType: "settings",
        width: 700,
        height: 500,
        title: "Settings",
        parent: true,
      });
    });
  },
} satisfies MainPlugin;
```

## PluginManager

Mirrors the renderer `PluginManager`. One difference: contributions use `Map<string, AnyRouter>` keyed by plugin name, since routers must be namespaced in the root router.

```typescript
export type MergedContributions = {
  routers: Map<string, AnyRouter>;
};

export class PluginManager {
  readonly #plugins: MainPlugin[];
  contributions: MergedContributions = { routers: new Map() };

  constructor(rawPlugins: MainPlugin[] = []) {
    this.#plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly MainPlugin[] { return this.#plugins; }
  async configContributions(ctx: PluginContext): Promise<void> { ... }
  async activate(ctx: PluginContext): Promise<void> { ... }
  async deactivate(): Promise<void> { ... }
}
```

After `configContributions`, `contributions.routers` maps `pluginName → AnyRouter`, used by `buildRouter`.

## Router

```typescript
// router.ts
import type { AnyRouter } from "@orpc/server";

export function buildRouter(pluginRouters: Map<string, AnyRouter>) {
  return os.router({
    ping: os.ping.handler(() => "pong" as const),
    acp: acpRouter,                          // hard-wired built-in
    ...Object.fromEntries(pluginRouters),    // plugins spread alongside
  });
}
```

## MainApp

`MainApp` owns plugin lifecycle and IPC wiring. Electron process events live in `index.ts`.

```typescript
// app.ts
export interface MainAppOptions {
  plugins?: MainPlugin[];
}

export class MainApp implements IMainApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  readonly windowManager: BrowserWindowManager;

  readonly #appContext: AppContext;
  #handler: RPCHandler<any> | null = null;

  constructor(appContext: AppContext, options: MainAppOptions = {}) {
    this.#appContext = appContext;
    this.pluginManager = new PluginManager(options.plugins ?? []);
    this.windowManager = new BrowserWindowManager();
  }

  async start(): Promise<void> {
    await this.#initPlugins();
    this.#registerIpc();
    this.windowManager.createMainWindow();
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
    void this.#appContext.acpConnectionManager.disconnectAll();
  }

  async #initPlugins(): Promise<void> {
    const ctx = { app: this };
    await this.pluginManager.configContributions(ctx);
    const router = buildRouter(this.pluginManager.contributions.routers);
    this.#handler = new RPCHandler(router);
    await this.pluginManager.activate(ctx);
  }

  #registerIpc(): void {
    ipcMain.on("start-orpc-server", (event) => {
      const [serverPort] = event.ports;
      this.#handler!.upgrade(serverPort, { context: this.#appContext });
      serverPort.start();
    });
  }
}
```

## Index

Electron process events live here — `MainApp` stays pure and testable.

```typescript
// index.ts
import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import { MainApp } from "./app";
import systemInfoPlugin from "./plugins/system-info";

const connectionManager = new AcpConnectionManager();
const appContext = { acpConnectionManager: connectionManager };
const mainApp = new MainApp(appContext, { plugins: [systemInfoPlugin] });

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  await mainApp.start();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainApp.windowManager.createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => { void mainApp.stop(); });
```

## Public Exports (`core/index.ts`)

Mirrors `renderer/src/core/index.ts`:

```typescript
export { MainApp } from "../app";
export type { MainAppOptions } from "../app";
export { BrowserWindowManager } from "../browser-window-manager";
export type {
  IMainApp,
  IBrowserWindowManager,
  MainPlugin,
  MainPluginHooks,
  MainPluginContributions,
  PluginContext,
  AppContext,
  OpenWindowOptions,
} from "./types";
export { PluginManager } from "./plugin-manager";
export type { MergedContributions } from "./plugin-manager";
export { DisposableStore, toDisposable } from "./disposable";
export type { Disposable } from "./disposable";
```

## Example Plugin (system-info)

```typescript
// plugins/system-info/index.ts
export default {
  name: "systemInfo",
  configContributions: () => ({
    router: os.router({
      getInfo: os.handler(() => ({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron ?? "",
        appVersion: app.getVersion(),
      })),
    }),
  }),
} satisfies MainPlugin;
```

## Lifecycle

1. `new MainApp(appContext, { plugins })` — construct, enforce ordering applied
2. `app.whenReady()` — Electron ready (handled in `index.ts`)
3. `mainApp.start()`:
   - `pluginManager.configContributions(ctx)` — parallel — collect `Map<name, AnyRouter>`
   - `buildRouter(routers)` — merge built-ins + plugin routers
   - `new RPCHandler(router)` — ready to serve RPC
   - `pluginManager.activate(ctx)` — series — side-effect setup
   - `windowManager.createMainWindow()` — show UI
4. `before-quit → mainApp.stop()` (in `index.ts`):
   - `pluginManager.deactivate()` — series
   - `windowManager.destroyAll()` — destroy all windows
   - `subscriptions.dispose()` — run cleanup handlers
   - `acpConnectionManager.disconnectAll()` — disconnect ACP
