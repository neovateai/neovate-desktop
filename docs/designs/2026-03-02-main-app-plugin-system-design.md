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
│   ├── plugin/
│   │   ├── types.ts              # MainPlugin, MainPluginHooks, PluginContributions, PluginContext
│   │   ├── contributions.ts      # Contributions type + buildContributions() util
│   │   ├── plugin-manager.ts     # PluginManager class
│   │   └── index.ts              # plugin barrel
│   ├── browser-window-manager.ts # BrowserWindowManager class
│   ├── disposable.ts             # DisposableStore (mirrors renderer)
│   ├── types.ts                  # IMainApp, IBrowserWindowManager, AppContext, OpenWindowOptions
│   └── index.ts                  # main barrel export (public SDK surface)
├── plugins/
│   └── system-info/
│       ├── index.ts              # MainPlugin definition
│       └── __tests__/
│           └── index.test.ts
├── features/
│   └── acp/                      # unchanged
├── app.ts                        # MainApp class (mirrors RendererApp)
├── router.ts                     # buildRouter(pluginRouters) — acp + ping hard-wired
└── index.ts                      # thin entry: Electron events + new MainApp(...).start()
```

## Core Types

Split across two files mirroring the renderer's `core/` vs `core/plugin/` split.

### `core/types.ts` — app-level types

```typescript
// core/types.ts
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

/** Abstract app interface — plugins depend on this, MainApp implements it. */
export interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
}
```

### `core/plugin/types.ts` — plugin types

```typescript
// core/plugin/types.ts
import type { AnyRouter, os } from "@orpc/server";
import type { IMainApp } from "../types";

export interface PluginContext {
  app: IMainApp;
  /** Host's orpc builder — use this instead of importing @orpc/server directly to avoid version mismatch */
  orpcServer: typeof os;
}

export interface PluginContributions {
  router?: AnyRouter;
}

export interface MainPluginHooks {
  configContributions(ctx: PluginContext): PluginContributions | Promise<PluginContributions>;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate(): void | Promise<void>;
}

export type MainPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<MainPluginHooks>;
```

Key decisions:

- `PluginContext = { app: IMainApp, orpcServer }` — `orpcServer` is the host's oRPC builder, passed to avoid version mismatch in third-party plugins
- `IMainApp` exposes `subscriptions` and `windowManager` — plugins can register cleanup and open windows
- `IBrowserWindowManager` lives in `core/types.ts` so `IMainApp` can reference it without circular deps
- `AppContext` is internal — used by `MainApp` to wire built-in acp router, never exposed to plugins via `IMainApp`
- `AnyRouter` instead of `Router<any, any>` — uses oRPC's own escape hatch type (`type AnyRouter = Router<any, any>`)

## BrowserWindowManager

Manages all `BrowserWindow` instances: the primary window and secondary windows opened by plugins or features.

### Primary vs Secondary

|                   | Primary                        | Secondary                      |
| ----------------- | ------------------------------ | ------------------------------ |
| Created by        | `MainApp.start()`              | plugins/features via `open()`  |
| macOS close       | **hide** (not destroy)         | destroy + remove from Map      |
| Dock icon click   | `win.show()` to restore        | —                              |
| State persistence | bounds only (`electron-store`) | none                           |
| Quantity          | exactly one                    | unlimited, keyed by `windowId` |

### State Persistence

Uses `electron-store` to save/restore primary window bounds. Only bounds — no maximized state.

```typescript
import Store from "electron-store";

type WindowStore = { bounds: Electron.Rectangle };
const store = new Store<WindowStore>({ name: "window-state" });

// save on close — getNormalBounds() returns non-maximized size even when maximized
win.on("close", () => store.set("bounds", win.getNormalBounds()));

// restore on create
const saved = store.get("bounds");
const bounds = saved ?? { width: 1200, height: 800 };
```

### macOS hide-on-close

On macOS, pressing ✕ hides the primary window instead of destroying it. The dock icon click (`activate`) restores it via `win.show()`.

```typescript
win.on("close", (event) => {
  if (process.platform === "darwin") {
    event.preventDefault();
    win.hide();
  }
});
```

On non-macOS, close destroys the window normally — `closed` fires, `#mainWindow` is nulled, and `window-all-closed` triggers app quit.

### `activate` in `index.ts`

```typescript
app.on("activate", () => {
  const win = mainApp.windowManager.mainWindow;
  if (!win) {
    mainApp.windowManager.createMainWindow(); // destroyed, re-create
  } else {
    win.show(); // hidden or minimized, restore
  }
});
```

`BrowserWindow.getAllWindows().length === 0` is the wrong check — the window exists but may be hidden. Use `mainWindow` getter instead.

### Full Implementation

```typescript
// core/browser-window-manager.ts
import Store from "electron-store";
import { join } from "path";
import { shell, BrowserWindow } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../../resources/icon.png?asset";
import type { IBrowserWindowManager, OpenWindowOptions } from "./types";

type WindowStore = { bounds: Electron.Rectangle };

export class BrowserWindowManager implements IBrowserWindowManager {
  #mainWindow: BrowserWindow | null = null;
  #windows = new Map<string, BrowserWindow>();
  #store = new Store<WindowStore>({ name: "window-state" });

  get mainWindow(): BrowserWindow | null {
    return this.#mainWindow;
  }

  createMainWindow(): BrowserWindow {
    const saved = this.#store.get("bounds");
    const bounds = saved ?? { width: 1200, height: 800 };

    const win = new BrowserWindow({
      ...bounds,
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

    // persist bounds on close (before hide/destroy)
    win.on("close", (event) => {
      this.#store.set("bounds", win.getNormalBounds());
      if (process.platform === "darwin") {
        event.preventDefault();
        win.hide();
      }
    });

    // only fires on non-macOS (macOS close is prevented above)
    win.on("closed", () => {
      this.#mainWindow = null;
    });

    this.#loadURL(win);
    this.#mainWindow = win;
    return win;
  }

  /**
   * Open a secondary window by ID.
   * Focuses existing window if already open.
   * Renderer reads `windowType` from URL params to decide what to render.
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

    const params = new URLSearchParams({ windowId, windowType, ...options.urlSearchParams });
    this.#loadURL(win, params);

    win.on("closed", () => this.#windows.delete(windowId));
    win.webContents.on("did-fail-load", () => {
      this.#windows.delete(windowId);
      if (!win.isDestroyed()) win.close();
    });

    this.#windows.set(windowId, win);
  }

  close(windowId: string): void {
    const win = this.#windows.get(windowId);
    if (win && !win.isDestroyed()) win.close();
  }

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

  #loadURL(win: BrowserWindow, params?: URLSearchParams): void {
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const url = new URL(process.env["ELECTRON_RENDERER_URL"]);
      if (params) url.search = params.toString();
      win.loadURL(url.toString());
    } else {
      win.loadFile(join(__dirname, "../renderer/index.html"), {
        ...(params ? { search: params.toString() } : {}),
      });
    }
  }
}
```

### Plugin usage example

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

## contributions.ts + PluginManager

### `core/plugin/contributions.ts`

Mirrors the renderer's `contributions.ts`. Owns the merged contributions type and the merge utility.

```typescript
// core/plugin/contributions.ts
import type { AnyRouter } from "@orpc/server";
import type { PluginContributions } from "./types";

export type Contributions = {
  routers: Map<string, AnyRouter>;
};

export function buildContributions(
  items: ({ name: string } & PluginContributions)[],
): Contributions {
  const routers = new Map<string, AnyRouter>();
  for (const { name, router } of items) {
    if (router) routers.set(name, router);
  }
  return { routers };
}

export const EMPTY_CONTRIBUTIONS: Contributions = { routers: new Map() };
```

### `core/plugin/plugin-manager.ts`

```typescript
// core/plugin/plugin-manager.ts
import { buildContributions, EMPTY_CONTRIBUTIONS, type Contributions } from "./contributions";

export class PluginManager {
  readonly #plugins: MainPlugin[];
  contributions: Contributions = EMPTY_CONTRIBUTIONS;

  constructor(rawPlugins: MainPlugin[] = []) {
    this.#plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly MainPlugin[] { return this.#plugins; }

  async configContributions(ctx: PluginContext): Promise<void> {
    const pluginsWithHook = this.#plugins.filter((p) => typeof p.configContributions === "function");
    const items = await Promise.all(pluginsWithHook.map(async (p) => ({
      name: p.name,
      ...(await p.configContributions!(ctx)),
    })));
    this.contributions = buildContributions(items);
  }

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
    acp: acpRouter, // hard-wired built-in
    ...Object.fromEntries(pluginRouters), // plugins spread alongside
  });
}
```

## MainApp

`MainApp` owns plugin lifecycle and window management only. No transport knowledge — `RPCHandler`, `ipcMain`, and oRPC wiring live entirely in `index.ts`. This keeps `MainApp` environment-agnostic and runnable in a pure Node context by swapping the transport in `index.ts`.

```typescript
// app.ts
import { os } from "@orpc/server";

export interface MainAppOptions {
  plugins?: MainPlugin[];
  windowManager: IBrowserWindowManager;
}

export class MainApp implements IMainApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  readonly windowManager: IBrowserWindowManager;

  constructor(options: MainAppOptions) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
    this.windowManager = options.windowManager;
  }

  async start(): Promise<void> {
    const ctx = { app: this, orpcServer: os };
    await this.pluginManager.configContributions(ctx);
    await this.pluginManager.activate(ctx);
    this.windowManager.createMainWindow();
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
  }
}
```

Key decisions:

- `windowManager` is injected — not constructed inside `MainApp`
- No `AppContext` on `MainApp` — only the transport needs it (to pass as RPC context)
- No `#handler`, no `ipcMain` — transport is fully external
- `start()` is a clean sequence: contributions → activate → show window

## Index

Electron process events and transport wiring live here.

```typescript
// index.ts
import { app, BrowserWindow, ipcMain } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import { BrowserWindowManager } from "./core/browser-window-manager";
import { MainApp } from "./app";
import { buildRouter } from "./router";
import systemInfoPlugin from "./plugins/system-info";

const connectionManager = new AcpConnectionManager();
const appContext = { acpConnectionManager: connectionManager };

const mainApp = new MainApp({
  plugins: [systemInfoPlugin],
  windowManager: new BrowserWindowManager(),
});

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await mainApp.start();

  // Transport — Electron MessagePort. Swap this for WS/HTTP in other environments.
  const handler = new RPCHandler(buildRouter(mainApp.pluginManager.contributions.routers));
  ipcMain.on("start-orpc-server", (event) => {
    const [port] = event.ports;
    handler.upgrade(port, { context: appContext });
    port.start();
  });

  app.on("activate", () => {
    const win = mainApp.windowManager.mainWindow;
    if (!win) mainApp.windowManager.createMainWindow();
    else win.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void mainApp.stop();
});
```

**Node/WS equivalent** — same `MainApp`, different transport:

```typescript
// server.ts
const mainApp = new MainApp({ plugins: [systemInfoPlugin], windowManager: noopWindowManager });
await mainApp.start();

const handler = new WebSocketHandler(buildRouter(mainApp.pluginManager.contributions.routers));
const wss = new WebSocketServer({ port: 3000 });
wss.on("connection", (ws) => handler.upgrade(ws, { context: appContext }));
```

## Public Exports (`core/index.ts`)

Mirrors `renderer/src/core/index.ts`:

```typescript
// core/index.ts
export { MainApp } from "../app";
export type { MainAppOptions } from "../app";
export { BrowserWindowManager } from "./browser-window-manager";
export type { IMainApp, IBrowserWindowManager, AppContext, OpenWindowOptions } from "./types";
export { PluginManager } from "./plugin/plugin-manager";
export { buildContributions, EMPTY_CONTRIBUTIONS } from "./plugin/contributions";
export type { Contributions } from "./plugin/contributions";
export type {
  MainPlugin,
  MainPluginHooks,
  PluginContributions,
  PluginContext,
} from "./plugin/types";
export { DisposableStore, toDisposable } from "./disposable";
export type { Disposable } from "./disposable";
```

## Example Plugin (system-info)

```typescript
// plugins/system-info/index.ts
import { app } from "electron";
import type { MainPlugin } from "../../core/plugin/types";

export default {
  name: "systemInfo",
  configContributions: ({ orpcServer }) => ({
    router: orpcServer.router({
      getInfo: orpcServer.handler(() => ({
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

1. `new MainApp({ plugins, windowManager })` — construct, enforce ordering applied
2. `app.whenReady()` — Electron ready (in `index.ts`)
3. `mainApp.start()`:
   - `pluginManager.configContributions(ctx)` — parallel — collect `Map<name, AnyRouter>`
   - `pluginManager.activate(ctx)` — series — side-effect setup
   - `windowManager.createMainWindow()` — show UI
4. Transport setup (in `index.ts`, after `start()`):
   - `buildRouter(mainApp.pluginManager.contributions.routers)` — merge built-ins + plugin routers
   - `new RPCHandler(router)` — ready to serve (Electron) or `WebSocketHandler` (Node/WS)
   - Register `ipcMain.on("start-orpc-server", ...)` or WS listener
5. `before-quit → mainApp.stop()` (in `index.ts`):
   - `pluginManager.deactivate()` — series
   - `windowManager.destroyAll()` — destroy all windows
   - `subscriptions.dispose()` — run cleanup handlers
