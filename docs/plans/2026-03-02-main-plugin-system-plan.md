# Main Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a plugin system for the Electron main process that lets plugins register oRPC routers alongside built-in features. Built-in features (ping, acp) remain unchanged. Plugins extend the app with additional routes.

**Architecture:** Plugins are objects with `name`, `configContributions(ctx)`, `activate(ctx)`, and `deactivate()` hooks. A `PluginManager` (mirroring the renderer pattern) collects router contributions in parallel, then the root router merges built-in routes + plugin routes. Plugin routers use closure-based context (self-contained, no dependency on `AppContext`). A system-info plugin demonstrates the system.

**Tech Stack:** TypeScript, oRPC, Electron, Vitest

**Worktree:** `/Users/dinq/.vibest/worktrees/neovateai/neovate-desktop/feat-main-plugin-system`

---

### Task 1: Create core plugin types

**Files:**
- Create: `packages/desktop/src/main/core/types.ts`

**Step 1: Write the type definitions**

```typescript
// packages/desktop/src/main/core/types.ts
import type { Router } from "@orpc/server";
import type { AcpConnectionManager } from "../features/acp/connection-manager";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

export interface MainPluginContributions {
  router?: Router<any, any>;
}

export interface PluginContext {
  appContext: AppContext;
}

export interface MainPluginHooks {
  configContributions: (ctx: PluginContext) => MainPluginContributions | Promise<MainPluginContributions>;
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate: () => void | Promise<void>;
}

export interface MainPlugin extends Partial<MainPluginHooks> {
  name: string;
  enforce?: "pre" | "post";
}
```

Note: `AppContext` moves here from `packages/desktop/src/main/router.ts:6-8`.

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/types.ts
git commit -m "feat: add main plugin system core types"
```

---

### Task 2: Create PluginManager

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
  return { appContext: {} } as any;
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
    it("collects router contributions from all plugins", async () => {
      const fakeRouter = { handler: "fake" };
      const plugin: MainPlugin = {
        name: "test",
        configContributions: () => ({ router: fakeRouter as any }),
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

    it("passes PluginContext to configContributions", async () => {
      const spy = vi.fn().mockReturnValue({});
      const plugin: MainPlugin = { name: "test", configContributions: spy };
      const ctx = makeCtx();

      const manager = new PluginManager([plugin]);
      await manager.configContributions(ctx);

      expect(spy).toHaveBeenCalledWith(ctx);
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
  });

  describe("deactivate", () => {
    it("calls deactivate on all plugins", async () => {
      const spy = vi.fn();
      const plugin: MainPlugin = { name: "test", deactivate: spy };

      const manager = new PluginManager([plugin]);
      await manager.deactivate();

      expect(spy).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/plugin-manager.test.ts`
Expected: FAIL — cannot resolve `../plugin-manager`

**Step 3: Write PluginManager implementation**

```typescript
// packages/desktop/src/main/core/plugin-manager.ts
import type { MainPlugin, MainPluginContributions, PluginContext } from "./types";
import type { Router } from "@orpc/server";

export type MergedContributions = {
  routers: Map<string, Router<any, any>>;
};

const EMPTY_CONTRIBUTIONS: MergedContributions = {
  routers: new Map(),
};

function mergeContributions(
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

export class PluginManager {
  private readonly plugins: MainPlugin[];
  contributions: MergedContributions = EMPTY_CONTRIBUTIONS;

  constructor(rawPlugins: MainPlugin[] = []) {
    this.plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly MainPlugin[] {
    return this.plugins;
  }

  async configContributions(ctx: PluginContext): Promise<void> {
    const pluginsWithHook = this.plugins.filter(
      (p) => typeof p.configContributions === "function",
    );
    const results = await Promise.all(
      pluginsWithHook.map((p) => p.configContributions!(ctx)),
    );
    this.contributions = mergeContributions(pluginsWithHook, results);
  }

  async activate(ctx: PluginContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (typeof plugin.activate === "function") {
        await plugin.activate(ctx);
      }
    }
  }

  async deactivate(): Promise<void> {
    for (const plugin of this.plugins) {
      if (typeof plugin.deactivate === "function") {
        await plugin.deactivate();
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/plugin-manager.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/plugin-manager.ts packages/desktop/src/main/core/__tests__/plugin-manager.test.ts
git commit -m "feat: add PluginManager with enforce ordering and lifecycle hooks"
```

---

### Task 3: Update root router to merge built-in + plugin routes

**Files:**
- Modify: `packages/desktop/src/main/router.ts`

The existing router statically wires `ping` + `acp`. We update it to also accept plugin routers and merge them in. The built-in routes stay exactly as they are (with `implement(contract).$context<AppContext>()`).

**Step 1: Update router.ts**

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

export function createRouter(pluginRouters: Map<string, Router<any, any>>) {
  return os.router({
    ping: os.ping.handler(() => "pong" as const),
    acp: acpRouter,
    ...Object.fromEntries(pluginRouters),
  });
}
```

Key change: `router` constant → `createRouter(pluginRouters)` function. Built-in `ping` and `acp` are unchanged. Plugin routers are spread alongside them.

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/router.ts
git commit -m "refactor: router accepts plugin routers alongside built-in routes"
```

---

### Task 4: Wire PluginManager into main entry point

**Files:**
- Modify: `packages/desktop/src/main/index.ts`

**Step 1: Update index.ts to use PluginManager**

```typescript
import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { RPCHandler } from "@orpc/server/message-port";
import { createRouter } from "./router";
import { PluginManager } from "./core/plugin-manager";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import type { AppContext } from "./core/types";

const ACP_DEBUG = process.env.ACP_DEBUG === "1";

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

const connectionManager = new AcpConnectionManager();
const appContext: AppContext = {
  acpConnectionManager: connectionManager,
};

const pluginManager = new PluginManager([]);
let handler: RPCHandler<any>;

async function initPlugins(): Promise<void> {
  const ctx = { appContext };
  await pluginManager.configContributions(ctx);
  const router = createRouter(pluginManager.contributions.routers);
  handler = new RPCHandler(router);
  await pluginManager.activate(ctx);
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await initPlugins();

  ipcMain.on("start-orpc-server", (event) => {
    const [serverPort] = event.ports;
    if (ACP_DEBUG) {
      console.log("[orpc] start-orpc-server received, upgrading message port");
    }
    handler.upgrade(serverPort, { context: appContext });
    serverPort.start();
  });

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void pluginManager.deactivate();
  void connectionManager.disconnectAll();
});
```

Key changes:
- Import `createRouter` instead of `router`
- Create `PluginManager` (empty for now — system-info plugin added in Task 5)
- `initPlugins()` collects contributions and builds router
- `handler.upgrade` still passes `appContext` — built-in routes (acp) use it via `$context`
- `before-quit` calls both `pluginManager.deactivate()` and `connectionManager.disconnectAll()`

**Step 2: Run typecheck**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 4: Commit**

```bash
git add packages/desktop/src/main/index.ts
git commit -m "feat: wire PluginManager into main entry point"
```

---

### Task 5: Create system-info example plugin

**Files:**
- Create: `packages/desktop/src/main/plugins/system-info/index.ts`
- Test: `packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts`

A simple plugin that exposes system information via oRPC — demonstrates the plugin system end-to-end.

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts
import { describe, it, expect } from "vitest";
import { call } from "@orpc/server";
import systemInfoPlugin from "..";
import type { PluginContext } from "../../../core/types";

describe("system-info plugin", () => {
  it("has name 'systemInfo'", () => {
    expect(systemInfoPlugin.name).toBe("systemInfo");
  });

  it("configContributions returns a router", async () => {
    const ctx = { appContext: {} } as PluginContext;
    const contributions = await systemInfoPlugin.configContributions!(ctx);
    expect(contributions.router).toBeDefined();
  });

  it("router.getInfo returns system info", async () => {
    const ctx = { appContext: {} } as PluginContext;
    const contributions = await systemInfoPlugin.configContributions!(ctx);
    const result = await call(contributions.router!.getInfo, undefined);

    expect(result).toHaveProperty("platform");
    expect(result).toHaveProperty("arch");
    expect(result).toHaveProperty("nodeVersion");
    expect(result).toHaveProperty("electronVersion");
    expect(result).toHaveProperty("appVersion");
    expect(typeof result.platform).toBe("string");
    expect(typeof result.arch).toBe("string");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: FAIL — cannot resolve `..`

**Step 3: Write the plugin**

```typescript
// packages/desktop/src/main/plugins/system-info/index.ts
import { os } from "@orpc/server";
import { app } from "electron";
import type { MainPlugin } from "../../core/types";

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

**Step 4: Run test to verify it passes**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: all PASS (may need to mock `electron` — if `app.getVersion()` fails in test, mock it with `vi.mock("electron", ...)`)

**Step 5: Register the plugin in index.ts**

In `packages/desktop/src/main/index.ts`, add the import and register:

```typescript
import systemInfoPlugin from "./plugins/system-info";

const pluginManager = new PluginManager([systemInfoPlugin]);
```

**Step 6: Commit**

```bash
git add packages/desktop/src/main/plugins/system-info/index.ts packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts packages/desktop/src/main/index.ts
git commit -m "feat: add system-info example plugin"
```

---

### Task 6: Verify full compatibility

**Step 1: Run full typecheck (both node and web)**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json && bunx tsgo --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 2: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 3: Commit (only if any fixups were needed)**

```bash
git commit -m "fix: ensure full compatibility with plugin system"
```

---

### Task 7: Create core/index.ts barrel export

**Files:**
- Create: `packages/desktop/src/main/core/index.ts`

**Step 1: Write barrel export**

```typescript
// packages/desktop/src/main/core/index.ts
export { PluginManager } from "./plugin-manager";
export type { MainPlugin, MainPluginHooks, MainPluginContributions, PluginContext, AppContext } from "./types";
```

**Step 2: Commit**

```bash
git add packages/desktop/src/main/core/index.ts
git commit -m "feat: add core barrel export for plugin SDK"
```
