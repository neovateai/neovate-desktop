# Main App & Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Electron main process to mirror the renderer plugin system — `MainApp` owns plugin lifecycle, `BrowserWindowManager` manages windows, transport lives entirely in `index.ts`.

**Architecture:** `core/` holds self-contained primitives (`disposable`, `types`, `plugin/`, `browser-window-manager`). `app.ts` is the assembler above `core/` — no transport knowledge, no Electron events. `index.ts` is the thin entry point: Electron events, `BrowserWindowManager` instantiation, transport wiring (`RPCHandler`, `ipcMain`). Built-in `acp` stays hard-wired; plugins extend via `Map<name, AnyRouter>` spread in `buildRouter`.

**Tech Stack:** TypeScript, oRPC (`@orpc/server`, `@orpc/contract`), Electron, `electron-store`, Vitest

**Worktree:** `/Users/dinq/.vibest/worktrees/neovateai/neovate-desktop/feat-main-plugin-system`

**Design doc:** `docs/designs/2026-03-02-main-app-plugin-system-design.md`

**Reference:** Renderer plugin system at `packages/desktop/src/renderer/src/core/`

---

### Task 1: Install `electron-store`

**Files:** none (dependency install)

`electron-store` is used by `BrowserWindowManager` for window bounds persistence. It is not yet in `package.json`.

**Step 1: Install the package**

```bash
cd packages/desktop && bun add electron-store
```

**Step 2: Verify it resolves**

```bash
cd packages/desktop && node -e "require('electron-store')" && echo OK
```
Expected: `OK`

**Step 3: Commit**

```bash
git add packages/desktop/package.json bun.lock
git commit -m "deps: add electron-store for window state persistence"
```

---

### Task 2: Create `core/disposable.ts`

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

### Task 3: Create `core/types.ts`

**Files:**
- Create: `packages/desktop/src/main/core/types.ts`

App-level interfaces: `IBrowserWindowManager`, `IMainApp`, `AppContext`, `OpenWindowOptions`.

`IBrowserWindowManager` lives here (not in `browser-window-manager.ts`) so `IMainApp` can reference it without circular deps. `PluginContext` lives in `core/plugin/types.ts` (Task 4).

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/types.ts
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

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/types.ts
git commit -m "feat: add main core app-level types"
```

---

### Task 4: Create `core/plugin/types.ts`

**Files:**
- Create: `packages/desktop/src/main/core/plugin/types.ts`

Plugin types live in their own subdirectory mirroring `renderer/src/core/plugin/`.

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/plugin/types.ts
import type { AnyRouter } from "@orpc/server";
import type { IMainApp } from "../types";

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

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/plugin/types.ts
git commit -m "feat: add main plugin types in core/plugin/"
```

---

### Task 5: Create `core/plugin/contributions.ts` with tests

**Files:**
- Create: `packages/desktop/src/main/core/plugin/contributions.ts`
- Test: `packages/desktop/src/main/core/plugin/__tests__/contributions.test.ts`

`mergeContributions` is a standalone utility — not a method on `PluginManager`. This matches how the renderer's `buildContributions` is a standalone function.

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/core/plugin/__tests__/contributions.test.ts
import { describe, it, expect } from "vitest";
import { mergeContributions, EMPTY_CONTRIBUTIONS } from "../contributions";
import type { MainPlugin } from "../types";

describe("mergeContributions", () => {
  it("returns empty map when no routers", () => {
    const plugins: MainPlugin[] = [{ name: "a" }, { name: "b" }];
    const result = mergeContributions(plugins, [{}, null]);
    expect(result.routers.size).toBe(0);
  });

  it("maps router to plugin name", () => {
    const fakeRouter = { getInfo: {} } as any;
    const plugins: MainPlugin[] = [{ name: "myPlugin" }];
    const result = mergeContributions(plugins, [{ router: fakeRouter }]);
    expect(result.routers.get("myPlugin")).toBe(fakeRouter);
  });

  it("skips plugins with no router in result", () => {
    const plugins: MainPlugin[] = [{ name: "a" }, { name: "b" }];
    const fakeRouter = {} as any;
    const result = mergeContributions(plugins, [{}, { router: fakeRouter }]);
    expect(result.routers.size).toBe(1);
    expect(result.routers.get("b")).toBe(fakeRouter);
  });

  it("handles multiple plugins with routers", () => {
    const r1 = {} as any;
    const r2 = {} as any;
    const plugins: MainPlugin[] = [{ name: "p1" }, { name: "p2" }];
    const result = mergeContributions(plugins, [{ router: r1 }, { router: r2 }]);
    expect(result.routers.get("p1")).toBe(r1);
    expect(result.routers.get("p2")).toBe(r2);
  });
});

describe("EMPTY_CONTRIBUTIONS", () => {
  it("has empty routers map", () => {
    expect(EMPTY_CONTRIBUTIONS.routers.size).toBe(0);
  });
});
```

**Step 2: Run test to confirm it fails**

Run: `cd packages/desktop && bunx vitest run src/main/core/plugin/__tests__/contributions.test.ts`
Expected: FAIL — cannot resolve `../contributions`

**Step 3: Write the implementation**

```typescript
// packages/desktop/src/main/core/plugin/contributions.ts
import type { AnyRouter } from "@orpc/server";
import type { MainPlugin, MainPluginContributions } from "./types";

export type MergedContributions = {
  routers: Map<string, AnyRouter>;
};

export function mergeContributions(
  plugins: MainPlugin[],
  results: (MainPluginContributions | null | undefined)[],
): MergedContributions {
  const routers = new Map<string, AnyRouter>();
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result?.router) {
      routers.set(plugins[i]!.name, result.router);
    }
  }
  return { routers };
}

export const EMPTY_CONTRIBUTIONS: MergedContributions = { routers: new Map() };
```

**Step 4: Run tests to confirm they pass**

Run: `cd packages/desktop && bunx vitest run src/main/core/plugin/__tests__/contributions.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/plugin/contributions.ts packages/desktop/src/main/core/plugin/__tests__/contributions.test.ts
git commit -m "feat: add mergeContributions utility and EMPTY_CONTRIBUTIONS"
```

---

### Task 6: Create `core/plugin/plugin-manager.ts` with tests

**Files:**
- Create: `packages/desktop/src/main/core/plugin/plugin-manager.ts`
- Test: `packages/desktop/src/main/core/plugin/__tests__/plugin-manager.test.ts`

`PluginManager` uses `mergeContributions` from `contributions.ts`. `configContributions` takes a `PluginContext` argument (slight divergence from renderer — renderer's `configContributions` takes no args).

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/core/plugin/__tests__/plugin-manager.test.ts
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin-manager";
import type { MainPlugin, PluginContext } from "../types";

function makeCtx(): PluginContext {
  return {
    app: {
      subscriptions: { push: vi.fn() },
      windowManager: {
        mainWindow: null,
        createMainWindow: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
      },
    },
  };
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
        configContributions: () =>
          new Promise((r) => setTimeout(() => { order.push("slow"); r({}); }, 10)),
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

Run: `cd packages/desktop && bunx vitest run src/main/core/plugin/__tests__/plugin-manager.test.ts`
Expected: FAIL — cannot resolve `../plugin-manager`

**Step 3: Write the implementation**

```typescript
// packages/desktop/src/main/core/plugin/plugin-manager.ts
import { mergeContributions, EMPTY_CONTRIBUTIONS, type MergedContributions } from "./contributions";
import type { MainPlugin, PluginContext } from "./types";

type HookFn = (...args: unknown[]) => unknown;

export class PluginManager {
  readonly #plugins: MainPlugin[];
  contributions: MergedContributions = EMPTY_CONTRIBUTIONS;

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
    this.contributions = mergeContributions(pluginsWithHook, results);
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
}
```

**Step 4: Run tests to confirm they pass**

Run: `cd packages/desktop && bunx vitest run src/main/core/plugin/__tests__/plugin-manager.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/plugin/plugin-manager.ts packages/desktop/src/main/core/plugin/__tests__/plugin-manager.test.ts
git commit -m "feat: add PluginManager with enforce ordering and lifecycle hooks"
```

---

### Task 7: Create `core/plugin/index.ts` barrel

**Files:**
- Create: `packages/desktop/src/main/core/plugin/index.ts`

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/plugin/index.ts
export { PluginManager } from "./plugin-manager";
export { mergeContributions, EMPTY_CONTRIBUTIONS } from "./contributions";
export type { MergedContributions } from "./contributions";
export type {
  MainPlugin,
  MainPluginHooks,
  MainPluginContributions,
  PluginContext,
} from "./types";
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/plugin/index.ts
git commit -m "feat: add core/plugin barrel export"
```

---

### Task 8: Create `core/browser-window-manager.ts`

**Files:**
- Create: `packages/desktop/src/main/core/browser-window-manager.ts`

Implements `IBrowserWindowManager`. Handles primary window (with bounds persistence via `electron-store` and macOS hide-on-close) and secondary windows (opened by plugins/features via `open()`).

No unit tests — Electron `BrowserWindow` APIs can't be unit-tested without a real Electron process. Covered by E2E tests. Verify with typecheck only.

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/browser-window-manager.ts
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

    // Persist bounds before close/hide
    win.on("close", (event) => {
      this.#store.set("bounds", win.getNormalBounds());
      if (process.platform === "darwin") {
        event.preventDefault();
        win.hide();
      }
    });

    // Only fires on non-macOS (macOS close is prevented above)
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

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/browser-window-manager.ts
git commit -m "feat: add BrowserWindowManager with state persistence and macOS hide-on-close"
```

---

### Task 9: Update `router.ts` to `buildRouter(pluginRouters)`

**Files:**
- Modify: `packages/desktop/src/main/router.ts`
- Modify: `packages/desktop/src/main/__tests__/router.test.ts`

Replace the static `router` export with a `buildRouter(pluginRouters)` function. Plugin routers are spread alongside the hard-wired built-ins. `AppContext` stays defined here (it's the transport's responsibility, not the plugin's).

**Step 1: Update `router.ts`**

```typescript
// packages/desktop/src/main/router.ts
import { implement } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { contract } from "../shared/contract";
import { acpRouter } from "./features/acp/router";
import type { AcpConnectionManager } from "./features/acp/connection-manager";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

export type AppDependencies = AppContext;

const os = implement(contract).$context<AppContext>();

export function buildRouter(pluginRouters: Map<string, AnyRouter>) {
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
import { describe, expect, it, vi } from "vitest";
import { buildRouter, type AppDependencies } from "../router";

const router = buildRouter(new Map());

describe("main router context wiring", () => {
  it("listAgents returns built-in agents from acp registry", async () => {
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

  it("spreads plugin routers into root", () => {
    const fakeRouter = { myHandler: vi.fn() } as any;
    const r = buildRouter(new Map([["myPlugin", fakeRouter]]));
    expect(r).toHaveProperty("myPlugin");
  });
});
```

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

### Task 10: Create `app.ts` (MainApp) with tests

**Files:**
- Create: `packages/desktop/src/main/app.ts`
- Test: `packages/desktop/src/main/__tests__/app.test.ts`

`MainApp` owns plugin lifecycle only. No transport (`RPCHandler`, `ipcMain`). `windowManager` is injected via `MainAppOptions` — not constructed inside.

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/__tests__/app.test.ts
import { describe, it, expect, vi } from "vitest";
import type { MainPlugin } from "../core/plugin/types";
import type { IBrowserWindowManager } from "../core/types";

function makeWindowManager(): IBrowserWindowManager {
  return {
    mainWindow: null,
    createMainWindow: vi.fn().mockReturnValue({}),
    open: vi.fn(),
    close: vi.fn(),
    destroyAll: vi.fn(),
  } as unknown as IBrowserWindowManager;
}

describe("MainApp", () => {
  it("exposes pluginManager", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({ windowManager: makeWindowManager() });
    expect(app.pluginManager).toBeDefined();
  });

  it("exposes subscriptions", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({ windowManager: makeWindowManager() });
    expect(typeof app.subscriptions.push).toBe("function");
  });

  it("exposes windowManager (the injected instance)", async () => {
    const { MainApp } = await import("../app");
    const wm = makeWindowManager();
    const app = new MainApp({ windowManager: wm });
    expect(app.windowManager).toBe(wm);
  });

  it("registers plugins passed in options", async () => {
    const { MainApp } = await import("../app");
    const plugin: MainPlugin = { name: "test" };
    const app = new MainApp({ plugins: [plugin], windowManager: makeWindowManager() });
    expect(app.pluginManager.getPlugins()).toContain(plugin);
  });

  it("start() calls configContributions, activate, then createMainWindow in order", async () => {
    const { MainApp } = await import("../app");
    const order: string[] = [];
    const plugin: MainPlugin = {
      name: "test",
      configContributions: () => { order.push("config"); return {}; },
      activate: () => { order.push("activate"); },
    };
    const wm = makeWindowManager();
    (wm.createMainWindow as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push("createMainWindow");
      return {};
    });

    const app = new MainApp({ plugins: [plugin], windowManager: wm });
    await app.start();

    expect(order).toEqual(["config", "activate", "createMainWindow"]);
  });

  it("stop() calls deactivate, destroyAll, and subscriptions.dispose", async () => {
    const { MainApp } = await import("../app");
    const wm = makeWindowManager();
    const app = new MainApp({ windowManager: wm });
    const deactivateSpy = vi.spyOn(app.pluginManager, "deactivate");
    const disposeSpy = vi.spyOn(app.subscriptions, "dispose");

    await app.stop();

    expect(deactivateSpy).toHaveBeenCalled();
    expect(wm.destroyAll).toHaveBeenCalled();
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
import { PluginManager } from "./core/plugin/plugin-manager";
import { DisposableStore } from "./core/disposable";
import type { IBrowserWindowManager, IMainApp } from "./core/types";
import type { MainPlugin } from "./core/plugin/types";

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
    const ctx = { app: this };
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

**Step 4: Run tests to confirm they pass**

Run: `cd packages/desktop && bunx vitest run src/main/__tests__/app.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/app.ts packages/desktop/src/main/__tests__/app.test.ts
git commit -m "feat: add MainApp with plugin lifecycle, windowManager injected"
```

---

### Task 11: Update `index.ts`

**Files:**
- Modify: `packages/desktop/src/main/index.ts`

`index.ts` is the thin entry point: Electron events, `BrowserWindowManager` instantiation, transport wiring. Nothing from here belongs in `MainApp`.

Key detail: `app.on("activate")` uses `mainApp.windowManager.mainWindow` — **not** `BrowserWindow.getAllWindows().length === 0`. The window may be hidden (macOS hide-on-close) so `getAllWindows()` would be non-empty but the window invisible. Use the `mainWindow` getter.

**Step 1: Replace `index.ts`**

```typescript
// packages/desktop/src/main/index.ts
import { app, ipcMain } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { RPCHandler } from "@orpc/server/message-port";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import { BrowserWindowManager } from "./core/browser-window-manager";
import { MainApp } from "./app";
import { buildRouter } from "./router";
import systemInfoPlugin from "./plugins/system-info";

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

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

  // Transport — Electron MessagePort. Swap for WS/HTTP in other environments.
  const handler = new RPCHandler(buildRouter(mainApp.pluginManager.contributions.routers));
  ipcMain.on("start-orpc-server", (event) => {
    const [serverPort] = event.ports;
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
```

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json`
Expected: no errors (will fail until Task 12 adds the system-info plugin — that's fine, come back and fix after Task 12)

**Step 3: Commit**

```bash
git add packages/desktop/src/main/index.ts
git commit -m "refactor: index.ts wires transport and Electron events, MainApp stays pure"
```

---

### Task 12: Create system-info plugin with contract and tests

**Files:**
- Create: `packages/desktop/src/shared/features/system-info/contract.ts`
- Modify: `packages/desktop/src/shared/contract.ts`
- Create: `packages/desktop/src/main/plugins/system-info/index.ts`
- Test: `packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts`

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

Open `packages/desktop/src/shared/contract.ts`. Add:

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
import type { PluginContext } from "../../../core/plugin/types";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn().mockReturnValue("1.0.0-test") },
}));

function makeCtx(): PluginContext {
  return {
    app: {
      subscriptions: { push: vi.fn() },
      windowManager: {
        mainWindow: null,
        createMainWindow: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
      },
    },
  };
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
import { implement } from "@orpc/server";
import { app } from "electron";
import { contract } from "../../../shared/contract";
import type { MainPlugin } from "../../core/plugin/types";

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

**Step 6: Run plugin tests**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: all PASS

**Step 7: Run full typecheck**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json && bunx tsc --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 8: Commit**

```bash
git add packages/desktop/src/shared/features/system-info/contract.ts packages/desktop/src/shared/contract.ts packages/desktop/src/main/plugins/system-info/index.ts packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts
git commit -m "feat: add system-info plugin with shared contract"
```

---

### Task 13: Create `core/index.ts` barrel export

**Files:**
- Create: `packages/desktop/src/main/core/index.ts`

The public SDK surface for `core/`. Mirrors `renderer/src/core/index.ts`.

Note: `MainApp` and `MainAppOptions` live in `app.ts` (outside `core/`) but are re-exported here for convenience, mirroring how the renderer's `core/index.ts` re-exports `RendererApp`.

**Step 1: Write the file**

```typescript
// packages/desktop/src/main/core/index.ts
export { MainApp } from "../app";
export type { MainAppOptions } from "../app";
export { BrowserWindowManager } from "./browser-window-manager";
export type { IMainApp, IBrowserWindowManager, AppContext, OpenWindowOptions } from "./types";
export { PluginManager } from "./plugin/plugin-manager";
export { mergeContributions, EMPTY_CONTRIBUTIONS } from "./plugin/contributions";
export type { MergedContributions } from "./plugin/contributions";
export type {
  MainPlugin,
  MainPluginHooks,
  MainPluginContributions,
  PluginContext,
} from "./plugin/types";
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

### Task 14: Run all tests and typecheck

**Step 1: Run all unit tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 2: Run full typecheck**

Run: `cd packages/desktop && bunx tsc --noEmit -p tsconfig.node.json && bunx tsc --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 3: Fix any issues found, then commit**

If there are failures, diagnose and fix them. Common issues:
- `electron-store` import syntax — use `import Store from "electron-store"` (default import)
- `destroyAll` not on `IBrowserWindowManager` (it's an internal method on the class, not the interface — that's correct, `index.ts` calls `mainApp.stop()` which delegates internally)
- `AnyRouter` not exported from `@orpc/server` — check with `grep -r "AnyRouter" node_modules/@orpc/server/dist`

```bash
git add -p
git commit -m "fix: address typecheck and test issues"
```
