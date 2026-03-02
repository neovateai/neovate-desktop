# Main Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a plugin system for the Electron main process that lets plugins register oRPC routers alongside built-in features. Built-in features (ping, acp) remain unchanged. Plugins extend the app with additional routes. A system-info plugin demonstrates the system end-to-end with unit tests, a renderer demo, and an e2e test.

**Architecture:** Plugins are objects with `name`, `configContributions(ctx)`, `activate(ctx)`, and `deactivate()` hooks. A `PluginManager` (mirroring the renderer pattern) collects router contributions in parallel, then the root router merges built-in routes + plugin routes. Plugin routers use closure-based context (self-contained, no dependency on `AppContext`).

**Tech Stack:** TypeScript, oRPC, Electron, Vitest, Playwright

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

### Task 5: Create system-info plugin with contract and unit tests

**Files:**
- Create: `packages/desktop/src/shared/features/system-info/contract.ts`
- Create: `packages/desktop/src/main/plugins/system-info/index.ts`
- Modify: `packages/desktop/src/shared/contract.ts`
- Test: `packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts`
- Modify: `packages/desktop/src/main/index.ts`

**Step 1: Write the shared contract for system-info**

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

**Step 2: Add systemInfo to the root contract**

```typescript
// packages/desktop/src/shared/contract.ts
import { oc, type } from "@orpc/contract";
import { acpContract } from "./features/acp/contract";
import { systemInfoContract } from "./features/system-info/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  acp: acpContract,
  systemInfo: systemInfoContract,
};
```

**Step 3: Write the failing test for the plugin**

```typescript
// packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { call } from "@orpc/server";
import type { PluginContext } from "../../../core/types";

vi.mock("electron", () => ({
  app: { getVersion: () => "1.0.0-test" },
}));

describe("system-info plugin", () => {
  // Re-import after mock is set up
  async function loadPlugin() {
    const mod = await import("..");
    return mod.default;
  }

  it("has name 'systemInfo'", async () => {
    const plugin = await loadPlugin();
    expect(plugin.name).toBe("systemInfo");
  });

  it("configContributions returns a router with getInfo", async () => {
    const plugin = await loadPlugin();
    const ctx = { appContext: {} } as PluginContext;
    const contributions = await plugin.configContributions!(ctx);
    expect(contributions.router).toBeDefined();
  });

  it("getInfo returns system info", async () => {
    const plugin = await loadPlugin();
    const ctx = { appContext: {} } as PluginContext;
    const contributions = await plugin.configContributions!(ctx);
    const result = await call(contributions.router!.getInfo, undefined);

    expect(result).toEqual({
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      appVersion: "1.0.0-test",
    });
  });
});
```

**Step 4: Run test to verify it fails**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: FAIL — cannot resolve `..`

**Step 5: Write the plugin**

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

**Step 6: Register the plugin in index.ts**

In `packages/desktop/src/main/index.ts`, update:

```typescript
import systemInfoPlugin from "./plugins/system-info";

const pluginManager = new PluginManager([systemInfoPlugin]);
```

**Step 7: Run tests**

Run: `cd packages/desktop && bunx vitest run src/main/plugins/system-info/__tests__/index.test.ts`
Expected: all PASS

**Step 8: Run full typecheck**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json && bunx tsgo --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 9: Commit**

```bash
git add packages/desktop/src/shared/features/system-info/contract.ts packages/desktop/src/shared/contract.ts packages/desktop/src/main/plugins/system-info/index.ts packages/desktop/src/main/plugins/system-info/__tests__/index.test.ts packages/desktop/src/main/index.ts
git commit -m "feat: add system-info plugin with contract and unit tests"
```

---

### Task 6: Add renderer demo for system-info plugin

**Files:**
- Create: `packages/desktop/src/renderer/src/features/system-info/system-info-demo.tsx`
- Modify: `packages/desktop/src/renderer/src/App.tsx`

A small component that calls the system-info plugin RPC and displays the result in the content panel. This demonstrates the full main→renderer flow through the plugin system.

**Step 1: Write the demo component**

```tsx
// packages/desktop/src/renderer/src/features/system-info/system-info-demo.tsx
import { useEffect, useState } from "react";
import { client } from "../../orpc";

type SystemInfo = {
  platform: string;
  arch: string;
  nodeVersion: string;
  electronVersion: string;
  appVersion: string;
};

export function SystemInfoDemo() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.systemInfo
      .getInfo()
      .then(setInfo)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="p-3" data-testid="system-info-error">
        <p className="text-sm text-destructive">Failed to load system info: {error}</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="p-3">
        <p className="text-xs text-muted-foreground">Loading system info...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="system-info">
      <h2 className="text-xs font-semibold text-muted-foreground">System Info (Plugin Demo)</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Platform</dt>
        <dd data-testid="system-info-platform">{info.platform}</dd>
        <dt className="text-muted-foreground">Arch</dt>
        <dd data-testid="system-info-arch">{info.arch}</dd>
        <dt className="text-muted-foreground">Node</dt>
        <dd data-testid="system-info-node">{info.nodeVersion}</dd>
        <dt className="text-muted-foreground">Electron</dt>
        <dd data-testid="system-info-electron">{info.electronVersion}</dd>
        <dt className="text-muted-foreground">App Version</dt>
        <dd data-testid="system-info-app-version">{info.appVersion}</dd>
      </dl>
    </div>
  );
}
```

**Step 2: Add to App.tsx**

In `packages/desktop/src/renderer/src/App.tsx`, replace the "Content" placeholder in `AppLayoutContentPanel`:

Add import:
```typescript
import { SystemInfoDemo } from "./features/system-info/system-info-demo";
```

Replace the content panel placeholder:
```tsx
<AppLayoutContentPanel>
  <SystemInfoDemo />
</AppLayoutContentPanel>
```

**Step 3: Run typecheck**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/features/system-info/system-info-demo.tsx packages/desktop/src/renderer/src/App.tsx
git commit -m "feat: add system-info renderer demo component"
```

---

### Task 7: Add e2e test for system-info plugin

**Files:**
- Create: `packages/desktop/e2e/plugin-system-info.test.ts`

This Playwright e2e test launches the Electron app, waits for the system-info demo to render, and verifies the plugin data flows from main→renderer.

**Step 1: Write the e2e test**

```typescript
// packages/desktop/e2e/plugin-system-info.test.ts
import { test, expect } from "./fixtures/electron";

test("system-info plugin renders data from main process", async ({ window }) => {
  const container = window.locator('[data-testid="system-info"]');
  await expect(container).toBeVisible({ timeout: 10_000 });

  const platform = window.locator('[data-testid="system-info-platform"]');
  await expect(platform).not.toBeEmpty();

  const arch = window.locator('[data-testid="system-info-arch"]');
  await expect(arch).not.toBeEmpty();

  const nodeVersion = window.locator('[data-testid="system-info-node"]');
  await expect(nodeVersion).toContainText(".");

  const electronVersion = window.locator('[data-testid="system-info-electron"]');
  await expect(electronVersion).toContainText(".");

  const appVersion = window.locator('[data-testid="system-info-app-version"]');
  await expect(appVersion).not.toBeEmpty();
});

test("system-info plugin does not show error", async ({ window }) => {
  // Wait for either success or error
  const info = window.locator('[data-testid="system-info"]');
  const error = window.locator('[data-testid="system-info-error"]');

  await expect(info.or(error)).toBeVisible({ timeout: 10_000 });
  await expect(error).not.toBeVisible();
});
```

**Step 2: Run the e2e test**

Run: `cd packages/desktop && bun run build && bunx playwright test e2e/plugin-system-info.test.ts`
Expected: all PASS

**Step 3: Commit**

```bash
git add packages/desktop/e2e/plugin-system-info.test.ts
git commit -m "test: add e2e test for system-info plugin"
```

---

### Task 8: Run all tests and verify

**Step 1: Run unit tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 2: Run full typecheck**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json && bunx tsgo --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 3: Run e2e tests**

Run: `cd packages/desktop && bun run build && bunx playwright test`
Expected: all PASS (including existing smoke tests + new plugin test)

**Step 4: Commit (only if any fixups were needed)**

```bash
git commit -m "fix: address test/typecheck issues"
```

---

### Task 9: Create core/index.ts barrel export

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
