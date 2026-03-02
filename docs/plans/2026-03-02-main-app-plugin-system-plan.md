# Main App & Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Electron main process to mirror the renderer plugin system — `MainApp` class owns lifecycle, `BrowserWindowManager` manages windows, `PluginManager` collects plugin contributions, `index.ts` is thin with Electron events outside `MainApp`.

**Architecture:** `MainApp` owns `pluginManager`, `subscriptions`, and `windowManager`. Electron lifecycle events (`app.whenReady`, `app.on(...)`) live in `index.ts` — not inside `MainApp` — keeping the class pure and testable. Built-in `acp` stays hard-wired in the router; plugins extend it via `Map<name, Router>` spread alongside.

**Tech Stack:** TypeScript, oRPC, Electron, Vitest

**Worktree:** `/Users/dinq/.vibest/worktrees/neovateai/neovate-desktop/feat-main-plugin-system`

**Reference:** Renderer plugin system at `packages/desktop/src/renderer/src/core/`

---

### Task 1: Create `core/disposable.ts`

**Files:**
- Create: `packages/desktop/src/main/core/disposable.ts`

Exact copy of the renderer's disposable — same interface, same class.

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/disposable.ts
export interface Disposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn };
}

export class DisposableStore {
  private items: Disposable[] = [];

  push(...disposables: Disposable[]): void {
    this.items.push(...disposables);
  }

  dispose(): void {
    const copy = this.items.splice(0);
    for (const item of copy) {
      item.dispose();
    }
  }
}
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/disposable.ts
git commit -m "feat: add main core disposable store"
```

---

### Task 2: Create `core/types.ts`

**Files:**
- Create: `packages/desktop/src/main/core/types.ts`

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/types.ts
import type { Router } from "@orpc/server";
import type { AcpConnectionManager } from "../features/acp/connection-manager";
import type { Disposable } from "./disposable";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

/** Abstract app interface — plugins depend on this, MainApp implements it */
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

Note: `AppContext` moves here from `packages/desktop/src/main/router.ts`.

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors (router.ts still exports its own `AppContext` — both can coexist temporarily)

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/types.ts
git commit -m "feat: add main plugin system core types"
```

---

### Task 3: Create `core/plugin-manager.ts` with tests

**Files:**
- Create: `packages/desktop/src/main/core/plugin-manager.ts`
- Test: `packages/desktop/src/main/core/__tests__/plugin-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/core/__tests__/plugin-manager.test.ts
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin-manager";
import type { MainPlugin, PluginContext } from "../types";

function makeCtx(): PluginContext {
  return { app: { subscriptions: { push: vi.fn() } } };
}

describe("PluginManager", () => {
  describe("enforce ordering", () => {
    it("sorts plugins: pre → normal → post", () => {
      const pre: MainPlugin = { name: "pre", enforce: "pre" };
      const normal: MainPlugin = { name: "normal" };
      const post: MainPlugin = { name: "post", enforce: "post" };

      const manager = new PluginManager([post, normal, pre]);
      const names = manager.getPlugins().map((p) => p.name);

      expect(names).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("configContributions", () => {
    it("collects router keyed by plugin name", async () => {
      const fakeRouter = { handler: "fake" } as any;
      const plugin: MainPlugin = {
        name: "test",
        configContributions: () => ({ router: fakeRouter }),
      };

      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.get("test")).toBe(fakeRouter);
    });

    it("skips plugins without configContributions", async () => {
      const plugin: MainPlugin = { name: "empty" };
      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.size).toBe(0);
    });

    it("skips plugins that return no router", async () => {
      const plugin: MainPlugin = { name: "no-router", configContributions: () => ({}) };
      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.size).toBe(0);
    });

    it("passes PluginContext to configContributions", async () => {
      const spy = vi.fn().mockReturnValue({});
      const plugin: MainPlugin = { name: "test", configContributions: spy };
      const ctx = makeCtx();

      const manager = new PluginManager([plugin]);
      await manager.configContributions(ctx);

      expect(spy).toHaveBeenCalledWith(ctx);
    });

    it("runs configContributions in parallel", async () => {
      const order: string[] = [];
      const slow: MainPlugin = {
        name: "slow",
        configContributions: () => new Promise((r) => setTimeout(() => { order.push("slow"); r({}); }, 10)),
      };
      const fast: MainPlugin = {
        name: "fast",
        configContributions: () => { order.push("fast"); return {}; },
      };

      const manager = new PluginManager([slow, fast]);
      await manager.configContributions(makeCtx());

      // fast resolves before slow because they run in parallel
      expect(order).toEqual(["fast", "slow"]);
    });
  });

  describe("activate", () => {
    it("calls activate in enforce order", async () => {
      const order: string[] = [];
      const mkPlugin = (name: string, enforce?: "pre" | "post"): MainPlugin => ({
        name,
        enforce,
        activate: () => { order.push(name); },
      });

      const manager = new PluginManager([
        mkPlugin("post", "post"),
        mkPlugin("normal"),
        mkPlugin("pre", "pre"),
      ]);
      await manager.activate(makeCtx());

      expect(order).toEqual(["pre", "normal", "post"]);
    });

    it("passes PluginContext to activate", async () => {
      const spy = vi.fn();
      const plugin: MainPlugin = { name: "test", activate: spy };
      const ctx = makeCtx();

      const manager = new PluginManager([plugin]);
      await manager.activate(ctx);

      expect(spy).toHaveBeenCalledWith(ctx);
    });
  });

  describe("deactivate", () => {
    it("calls deactivate on all plugins", async () => {
      const spy = vi.fn();
      const plugin: MainPlugin = { name: "test", deactivate: spy };

      const manager = new PluginManager([plugin]);
      await manager.deactivate();

      expect(spy).toHaveBeenCalled();
    });

    it("skips plugins without deactivate", async () => {
      const plugin: MainPlugin = { name: "empty" };
      const manager = new PluginManager([plugin]);
      await expect(manager.deactivate()).resolves.toBeUndefined();
    });
  });
});
```

**Step 2: Run test to confirm it fails**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/plugin-manager.test.ts`
Expected: FAIL — cannot resolve `../plugin-manager`

**Step 3: Write the implementation**

```typescript
// packages/desktop/src/main/core/plugin-manager.ts
import type { Router } from "@orpc/server";
import type { MainPlugin, MainPluginContributions, PluginContext } from "./types";

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

  getPlugins(): readonly MainPlugin[] {
    return this.#plugins;
  }

  async configContributions(ctx: PluginContext): Promise<void> {
    const pluginsWithHook = this.#plugins.filter(
      (p) => typeof p.configContributions === "function",
    );
    const results = await Promise.all(
      pluginsWithHook.map((p) => p.configContributions!(ctx)),
    );
    this.contributions = this.#mergeContributions(pluginsWithHook, results);
  }

  async activate(ctx: PluginContext): Promise<void> {
    for (const plugin of this.#plugins) {
      if (typeof plugin.activate === "function") {
        await plugin.activate(ctx);
      }
    }
  }

  async deactivate(): Promise<void> {
    for (const plugin of this.#plugins) {
      if (typeof plugin.deactivate === "function") {
        await plugin.deactivate();
      }
    }
  }

  #mergeContributions(
    plugins: MainPlugin[],
    results: (MainPluginContributions | null | undefined)[],
  ): MergedContributions {
    const routers = new Map<string, Router<any, any>>();
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result?.router) {
        routers.set(plugins[i]!.name, result.router);
      }
    }
    return { routers };
  }
}
```

**Step 4: Run tests to confirm they pass**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/plugin-manager.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/plugin-manager.ts packages/desktop/src/main/core/__tests__/plugin-manager.test.ts
git commit -m "feat: add PluginManager with enforce ordering and lifecycle hooks"
```

---

### Task 4: Create `browser-window-manager.ts`

**Files:**
- Create: `packages/desktop/src/main/browser-window-manager.ts`

Owns `BrowserWindow` creation, tracking, and teardown. Extracted from `index.ts`.

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/browser-window-manager.ts
import { join } from "path";
import { shell, BrowserWindow } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

export class BrowserWindowManager {
  #mainWindow: BrowserWindow | null = null;

  get mainWindow(): BrowserWindow | null {
    return this.#mainWindow;
  }

  createWindow(): BrowserWindow {
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

  destroyAll(): void {
    if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      this.#mainWindow.destroy();
    }
    this.#mainWindow = null;
  }
}
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/browser-window-manager.ts
git commit -m "feat: add BrowserWindowManager"
```

---

### Task 5: Update `router.ts` to `buildRouter(pluginRouters)`

**Files:**
- Modify: `packages/desktop/src/main/router.ts`
- Modify: `packages/desktop/src/main/__tests__/router.test.ts`

**Step 1: Update `router.ts`**

```typescript
// packages/desktop/src/main/router.ts
import { implement } from "@orpc/server";
import type { Router } from "@orpc/server";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import type { AppContext } from "./core/types";

export type { AppContext } from "./core/types";
export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export function buildRouter(pluginRouters: Map<string, Router<any, any>>) {
  return os.router({
    ping: os.ping.handler(() => "pong" as const),
    acp: acpRouter,
    ...Object.fromEntries(pluginRouters),
  });
}
```

**Step 2: Update the router test**

```typescript
// packages/desktop/src/main/__tests__/router.test.ts
import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { buildRouter, type AppDependencies } from "../router";

const router = buildRouter(new Map());

describe("main router context wiring", () => {
  it("listAgents returns built-in agents from acpx registry", async () => {
    const context = {
      acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
    } satisfies AppDependencies;

    const agents = await call(router.acp.listAgents, undefined, { context });

    expect(agents).toBeInstanceOf(Array);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent).toHaveProperty("id");
      expect(agent).toHaveProperty("name");
    }
  });

  it("ping returns pong", async () => {
    const result = await call(router.ping, undefined);
    expect(result).toBe("pong");
  });

  it("spreads plugin routers into root", async () => {
    const fakeHandler = vi.fn().mockResolvedValue("ok");
    const pluginRouters = new Map([["myPlugin", { myHandler: fakeHandler } as any]]);
    const r = buildRouter(pluginRouters);
    expect(r).toHaveProperty("myPlugin");
  });
});
```

Add `import { vi } from "vitest"` to the imports at the top.

**Step 3: Run tests**

Run: `cd packages/desktop && bunx vitest run src/main/__tests__/router.test.ts`
Expected: all PASS

**Step 4: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 5: Commit**

```bash
git add packages/desktop/src/main/router.ts packages/desktop/src/main/__tests__/router.test.ts
git commit -m "refactor: router accepts plugin routers alongside built-in routes"
```

---

### Task 6: Create `app.ts` (MainApp) with tests

**Files:**
- Create: `packages/desktop/src/main/app.ts`
- Test: `packages/desktop/src/main/__tests__/app.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/__tests__/app.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MainPlugin, AppContext } from "../core/types";

// Mock Electron before importing MainApp
vi.mock("electron", () => ({
  ipcMain: { on: vi.fn() },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    webContents: { setWindowOpenHandler: vi.fn() },
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
  })),
  app: { getVersion: vi.fn().mockReturnValue("0.0.0") },
  shell: { openExternal: vi.fn() },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
}));

vi.mock("@orpc/server/message-port", () => ({
  RPCHandler: vi.fn().mockImplementation(() => ({
    upgrade: vi.fn(),
  })),
}));

function makeAppContext(): AppContext {
  return {
    acpConnectionManager: {
      disconnectAll: vi.fn(),
    } as any,
  };
}

describe("MainApp", () => {
  it("exposes pluginManager", async () => {
    const { MainApp } = await import("../app");
    const mainApp = new MainApp(makeAppContext());
    expect(mainApp.pluginManager).toBeDefined();
  });

  it("exposes subscriptions", async () => {
    const { MainApp } = await import("../app");
    const mainApp = new MainApp(makeAppContext());
    expect(mainApp.subscriptions).toBeDefined();
    expect(typeof mainApp.subscriptions.push).toBe("function");
  });

  it("exposes windowManager", async () => {
    const { MainApp } = await import("../app");
    const mainApp = new MainApp(makeAppContext());
    expect(mainApp.windowManager).toBeDefined();
  });

  it("registers plugins passed in options", async () => {
    const { MainApp } = await import("../app");
    const plugin: MainPlugin = { name: "test" };
    const mainApp = new MainApp(makeAppContext(), { plugins: [plugin] });
    expect(mainApp.pluginManager.getPlugins()).toContain(plugin);
  });

  it("stop() calls pluginManager.deactivate and subscriptions.dispose", async () => {
    const { MainApp } = await import("../app");
    const mainApp = new MainApp(makeAppContext());
    const deactivateSpy = vi.spyOn(mainApp.pluginManager, "deactivate");
    const disposeSpy = vi.spyOn(mainApp.subscriptions, "dispose");
    await mainApp.stop();
    expect(deactivateSpy).toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to confirm it fails**

Run: `cd packages/desktop && bunx vitest run src/main/__tests__/app.test.ts`
Expected: FAIL — cannot resolve `../app`

**Step 3: Write the implementation**

```typescript
// packages/desktop/src/main/app.ts
import { ipcMain } from "electron";
import { RPCHandler } from "@orpc/server/message-port";
import { PluginManager } from "./core/plugin-manager";
import { DisposableStore } from "./core/disposable";
import { BrowserWindowManager } from "./browser-window-manager";
import { buildRouter } from "./router";
import type { MainPlugin, IMainApp, AppContext } from "./core/types";

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
    this.windowManager.createWindow();
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

**Step 4: Run tests to confirm they pass**

Run: `cd packages/desktop && bunx vitest run src/main/__tests__/app.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/app.ts packages/desktop/src/main/__tests__/app.test.ts
git commit -m "feat: add MainApp class with plugin lifecycle and window management"
```

---

### Task 7: Update `index.ts`

**Files:**
- Modify: `packages/desktop/src/main/index.ts`

Electron lifecycle events live here, not inside `MainApp`. `index.ts` stays thin.

**Step 1: Replace `index.ts`**

```typescript
// packages/desktop/src/main/index.ts
import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import { MainApp } from "./app";

const ACP_DEBUG = process.env.ACP_DEBUG === "1";

if (ACP_DEBUG) {
  // ACP debug logging enabled
}

const connectionManager = new AcpConnectionManager();
const appContext = { acpConnectionManager: connectionManager };

const mainApp = new MainApp(appContext);

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await mainApp.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainApp.windowManager.createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void mainApp.stop();
});
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 4: Commit**

```bash
git add packages/desktop/src/main/index.ts
git commit -m "refactor: index.ts uses MainApp, Electron events stay outside class"
```

---

### Task 8: Create system-info plugin with contract and tests

**Files:**
- Create: `packages/desktop/src/shared/features/system-info/contract.ts`
- Modify: `packages/desktop/src/shared/contract.ts`
- Create: `packages/desktop/src/main/plugins/system-info/index.ts`
- Test: `packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts`
- Modify: `packages/desktop/src/main/index.ts`

**Step 1: Write the shared contract**

```typescript
// packages/desktop/src/shared/features/system-info/contract.ts
import { oc, type } from "@orpc/contract";

export type SystemInfo = {
  platform: string;
  arch: string;
  nodeVersion: string;
  electronVersion: string;
  appVersion: string;
};

export const systemInfoContract = {
  getInfo: oc.output(type<SystemInfo>()),
};
```

**Step 2: Add systemInfo to root contract**

Open `packages/desktop/src/shared/contract.ts`. Current content:

```typescript
import { oc, type } from "@orpc/contract";
import { acpContract } from "./features/acp/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  acp: acpContract,
};
```

Update to:

```typescript
import { oc, type } from "@orpc/contract";
import { acpContract } from "./features/acp/contract";
import { systemInfoContract } from "./features/system-info/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  acp: acpContract,
  systemInfo: systemInfoContract,
};
```

**Step 3: Write the failing plugin test**

```typescript
// packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { call } from "@orpc/server";
import type { PluginContext } from "../../../core/types";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn().mockReturnValue("1.0.0-test") },
}));

function makeCtx(): PluginContext {
  return { app: { subscriptions: { push: vi.fn() } } };
}

describe("system-info plugin", () => {
  beforeEach(() => { vi.resetModules(); });

  async function loadPlugin() {
    const mod = await import("../index");
    return mod.default;
  }

  it("has name 'systemInfo'", async () => {
    const plugin = await loadPlugin();
    expect(plugin.name).toBe("systemInfo");
  });

  it("configContributions returns a router", async () => {
    const plugin = await loadPlugin();
    const contributions = await plugin.configContributions!(makeCtx());
    expect(contributions.router).toBeDefined();
  });

  it("getInfo returns system info", async () => {
    const plugin = await loadPlugin();
    const contributions = await plugin.configContributions!(makeCtx());
    const result = await call(contributions.router!.getInfo, undefined);

    expect(result).toMatchObject({
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      appVersion: "1.0.0-test",
    });
    expect(typeof result.electronVersion).toBe("string");
  });
});
```

**Step 4: Run test to confirm it fails**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: FAIL — cannot resolve `../index`

**Step 5: Write the plugin**

```typescript
// packages/desktop/src/main/plugins/system-info/index.ts
import { os } from "@orpc/server";
import { app } from "electron";
import { implement } from "@orpc/server";
import { contract } from "../../../shared/contract";
import type { MainPlugin, AppContext } from "../../core/types";

const oi = implement(contract.systemInfo);

export default {
  name: "systemInfo",
  configContributions: () => ({
    router: oi.router({
      getInfo: oi.getInfo.handler(() => ({
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

**Step 6: Register plugin in `index.ts`**

In `packages/desktop/src/main/index.ts`, add the import and pass the plugin:

```typescript
import systemInfoPlugin from "./plugins/system-info";

const mainApp = new MainApp(appContext, { plugins: [systemInfoPlugin] });
```

**Step 7: Run plugin tests**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: all PASS

**Step 8: Run full typecheck**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json && bunx tsc --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 9: Commit**

```bash
git add packages/desktop/src/shared/features/system-info/contract.ts packages/desktop/src/shared/contract.ts packages/desktop/src/main/plugins/system-info/index.ts packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts packages/desktop/src/main/index.ts
git commit -m "feat: add system-info plugin with contract and tests"
```

---

### Task 9: Create `core/index.ts` barrel export

**Files:**
- Create: `packages/desktop/src/main/core/index.ts`

**Step 1: Write the barrel**

```typescript
// packages/desktop/src/main/core/index.ts
export { PluginManager } from "./plugin-manager";
export type { MergedContributions } from "./plugin-manager";
export type {
  MainPlugin,
  MainPluginHooks,
  MainPluginContributions,
  PluginContext,
  AppContext,
  IMainApp,
} from "./types";
export { DisposableStore, toDisposable } from "./disposable";
export type { Disposable } from "./disposable";
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/index.ts
git commit -m "feat: add main core barrel export"
```

---

### Task 10: Run all tests and typecheck

**Step 1: Run all unit tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 2: Run full typecheck**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json && bunx tsc --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 3: Fix any issues found, then commit if needed**

```bash
git add -p
git commit -m "fix: address typecheck and test issues"
```
