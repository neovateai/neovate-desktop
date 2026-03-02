# Main App & Plugin System Design

## Goal

Redesign the Electron main process to mirror the renderer plugin system pattern:
- `MainApp` class owns all lifecycle (mirrors `RendererApp`)
- `BrowserWindowManager` manages window creation and tracking
- `PluginManager` collects plugin contributions and runs lifecycle hooks
- `index.ts` is ultra-thin: `new MainApp(appContext, { plugins: [...] }).start()`

## Non-Goals

- Migrating `acp` to a plugin (stays as a built-in feature, hard-wired in router)
- Plugin sandboxing (same process, full Node.js/Electron access)
- Hot reload

## File Structure

```
src/main/
├── core/
│   ├── types.ts              # MainPlugin, IMainApp, PluginContext, AppContext, etc.
│   ├── plugin-manager.ts     # PluginManager class
│   ├── disposable.ts         # DisposableStore (mirrors renderer)
│   └── index.ts              # barrel export (public SDK surface)
├── app.ts                    # MainApp class (mirrors RendererApp)
├── browser-window-manager.ts # BrowserWindowManager class
├── router.ts                 # buildRouter(pluginRouters) — acp + ping hard-wired
├── features/acp/             # unchanged
├── plugins/system-info/      # example plugin
└── index.ts                  # ultra-thin entry point
```

## Core Types

```typescript
// core/types.ts
import type { Router } from "@orpc/server";
import type { AcpConnectionManager } from "../features/acp/connection-manager";
import type { Disposable } from "./disposable";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

export interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
}

export interface PluginContext {
  app: IMainApp;
}

export interface MainPluginContributions {
  router?: Router<any, any>;
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
- `IMainApp` exposes only `subscriptions` — plugins don't need `AppContext`
- `configContributions(ctx)` takes context (slight divergence from renderer where it takes no args) — kept to allow future plugins that need app access at contribution time
- `AppContext` is internal — used by `MainApp` to wire built-in acp router, never exposed to plugins via `IMainApp`

## PluginManager

Mirrors the renderer `PluginManager` with one difference: contributions use `Map<string, Router>` (keyed by plugin name) instead of flat arrays, since routers must be namespaced in the root router.

```typescript
export type MergedContributions = {
  routers: Map<string, Router<any, any>>;
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

After `configContributions`, `contributions.routers` maps `pluginName → Router`, used by `buildRouter`.

## Router

```typescript
// router.ts
export function buildRouter(pluginRouters: Map<string, Router<any, any>>) {
  return os.router({
    ping: os.ping.handler(() => "pong" as const),
    acp: acpRouter,                          // hard-wired built-in
    ...Object.fromEntries(pluginRouters),    // plugins spread alongside
  });
}
```

## MainApp

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
    await app.whenReady();
    await this.#initPlugins();
    this.#registerIpc();
    this.windowManager.createWindow();
    this.#registerLifecycle();
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
    void this.#appContext.acpConnectionManager.disconnectAll();
  }

  #initPlugins = async (): Promise<void> => {
    const ctx = { app: this };
    await this.pluginManager.configContributions(ctx);
    const router = buildRouter(this.pluginManager.contributions.routers);
    this.#handler = new RPCHandler(router);
    await this.pluginManager.activate(ctx);
  };

  #registerIpc = (): void => {
    ipcMain.on("start-orpc-server", (event) => {
      const [serverPort] = event.ports;
      this.#handler!.upgrade(serverPort, { context: this.#appContext });
      serverPort.start();
    });
  };

  #registerLifecycle = (): void => {
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) this.windowManager.createWindow();
    });
    app.on("before-quit", () => { void this.stop(); });
  };
}
```

## BrowserWindowManager

Owns `BrowserWindow` creation, tracking, and teardown. Extracted from `index.ts`.

```typescript
export class BrowserWindowManager {
  #mainWindow: BrowserWindow | null = null;

  createWindow(): BrowserWindow { ... }
  destroyAll(): void { ... }
}
```

## Index (ultra-thin)

```typescript
// index.ts
import { MainApp } from "./app";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import systemInfoPlugin from "./plugins/system-info";

const connectionManager = new AcpConnectionManager();
const appContext = { acpConnectionManager: connectionManager };

new MainApp(appContext, { plugins: [systemInfoPlugin] }).start();
```

## Public Exports (`core/index.ts`)

Mirrors `renderer/src/core/index.ts`:

```typescript
export { MainApp } from "../app";
export type { MainAppOptions } from "../app";
export type { IMainApp } from "./types";
export type { MainPlugin, MainPluginHooks, MainPluginContributions, PluginContext, AppContext } from "./types";
export { PluginManager } from "./plugin-manager";
export { DisposableStore, toDisposable } from "./disposable";
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
        electronVersion: process.versions.electron,
        appVersion: app.getVersion(),
      })),
    }),
  }),
} satisfies MainPlugin;
```

## Lifecycle

1. `new MainApp(appContext, { plugins })` — construct, enforce ordering applied
2. `app.whenReady()` — wait for Electron
3. `pluginManager.configContributions(ctx)` — parallel — collect `Map<name, Router>`
4. `buildRouter(routers)` — merge built-ins + plugin routers
5. `new RPCHandler(router)` — ready to serve RPC
6. `pluginManager.activate(ctx)` — series — side-effect setup
7. `windowManager.createWindow()` — show UI
8. `before-quit → stop()` — deactivate plugins, destroy windows, dispose subscriptions
