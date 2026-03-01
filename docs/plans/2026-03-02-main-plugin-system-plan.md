# Main Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a plugin system for the Electron main process so that features (like ACP) are loaded as plugins with a unified activate/deactivate lifecycle and oRPC router contributions.

**Architecture:** Plugins are objects with `name`, `configContributions(ctx)`, `activate(ctx)`, and `deactivate()` hooks. A `PluginManager` (mirroring the renderer pattern) collects router contributions in parallel, merges them into the root oRPC router, then activates plugins in enforce order. The existing ACP feature migrates into this system as the first plugin.

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

export type AppContext = {
  acpConnectionManager: import("../features/acp/connection-manager").AcpConnectionManager;
};
```

Note: `AppContext` moves here from `packages/desktop/src/main/router.ts:6-8`. The old `router.ts` will import from here instead.

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors (may need to adjust import paths)

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
  return { appContext: { acpConnectionManager: {} } } as any;
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
import type { MainPlugin, MainPluginHooks, MainPluginContributions, PluginContext } from "./types";
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

### Task 3: Create router builder from plugin contributions

**Files:**
- Create: `packages/desktop/src/main/core/router.ts`
- Test: `packages/desktop/src/main/core/__tests__/router.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/core/__tests__/router.test.ts
import { describe, it, expect } from "vitest";
import { call } from "@orpc/server";
import { buildRouter } from "../router";

describe("buildRouter", () => {
  it("includes ping handler", async () => {
    const router = buildRouter(new Map());
    const result = await call(router.ping, undefined, { context: {} });
    expect(result).toBe("pong");
  });

  it("includes plugin routers under their name", () => {
    const fakeRouter = { someHandler: "fake" };
    const routers = new Map([["myPlugin", fakeRouter as any]]);
    const router = buildRouter(routers);
    expect(router.myPlugin).toBe(fakeRouter);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/router.test.ts`
Expected: FAIL — cannot resolve `../router`

**Step 3: Write the router builder**

```typescript
// packages/desktop/src/main/core/router.ts
import { os } from "@orpc/server";
import type { Router } from "@orpc/server";

export function buildRouter(pluginRouters: Map<string, Router<any, any>>) {
  return {
    ping: os.handler(() => "pong" as const),
    ...Object.fromEntries(pluginRouters),
  };
}
```

Note: This replaces the old `packages/desktop/src/main/router.ts` which statically wired `ping` + `acp`. The contract in `src/shared/contract.ts` is unchanged — it still defines the shape for the renderer client.

**Step 4: Run test to verify it passes**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/router.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/router.ts packages/desktop/src/main/core/__tests__/router.test.ts
git commit -m "feat: add buildRouter to merge plugin routers into root"
```

---

### Task 4: Create ACP plugin definition

**Files:**
- Create: `packages/desktop/src/main/plugins/acp/index.ts`

This wraps the existing ACP feature as a `MainPlugin`. The actual router, connection-manager, connection, and shell-env files stay in `features/acp/` for now — only the plugin entry point is new.

**Step 1: Write the plugin definition**

```typescript
// packages/desktop/src/main/plugins/acp/index.ts
import type { MainPlugin } from "../../core/types";
import { acpRouter } from "../../features/acp/router";

export default {
  name: "acp",
  configContributions: () => ({
    router: acpRouter,
  }),
  deactivate: () => {
    // Cleanup handled via appContext in index.ts for now.
    // Will move connectionManager lifecycle here in a future iteration.
  },
} satisfies MainPlugin;
```

Note: The `acpRouter` currently uses `implement({ acp: acpContract }).$context<AppContext>()` internally, and the router object it exports is `os.acp.router({...})`. This means it's already namespaced as `acp.*` procedures. We need to adjust this — the plugin system namespaces by plugin name, so the router should export the inner procedures directly (without the `acp` wrapper). This adjustment happens in Task 5.

**Step 2: Verify it compiles**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/plugins/acp/index.ts
git commit -m "feat: add ACP main plugin definition"
```

---

### Task 5: Adjust ACP router for plugin namespace

**Files:**
- Modify: `packages/desktop/src/main/features/acp/router.ts`

Currently the ACP router is built as `os.acp.router({...})` — the `acp` namespace is baked in. The plugin system will mount it under `acp` by name, so the router itself should be flat (just the procedures).

**Step 1: Check current acpRouter export shape**

The current code is:
```typescript
const os = implement({ acp: acpContract }).$context<AppContext>();
export const acpRouter = os.acp.router({ listAgents: ..., connect: ..., ... });
```

This creates a router already nested under `acp`. When the plugin system does `{ acp: acpRouter }`, it would double-nest as `acp.acp.*`.

**Step 2: Adjust the router to be flat**

Change `packages/desktop/src/main/features/acp/router.ts`:

Replace:
```typescript
const os = implement({ acp: acpContract }).$context<AppContext>();
```
With:
```typescript
const os = implement(acpContract).$context<AppContext>();
```

And replace:
```typescript
export const acpRouter = os.acp.router({
  listAgents: os.acp.listAgents.handler(...),
  connect: os.acp.connect.handler(...),
  ...
});
```
With:
```typescript
export const acpRouter = os.router({
  listAgents: os.listAgents.handler(...),
  connect: os.connect.handler(...),
  ...
});
```

Every `os.acp.X` becomes `os.X`.

**Step 3: Run existing ACP tests**

Run: `cd packages/desktop && bunx vitest run src/main/features/acp/__tests__/router.test.ts`
Expected: all PASS (the tests call `acpRouter.listAgents`, `acpRouter.connect` etc. — same shape)

**Step 4: Commit**

```bash
git add packages/desktop/src/main/features/acp/router.ts
git commit -m "refactor: flatten ACP router for plugin system namespace"
```

---

### Task 6: Wire PluginManager into main entry point

**Files:**
- Modify: `packages/desktop/src/main/index.ts`
- Modify: `packages/desktop/src/main/router.ts` (remove old static wiring, re-export AppContext from core)

**Step 1: Update router.ts to re-export from core**

Replace `packages/desktop/src/main/router.ts` with a thin re-export so existing imports (`import type { AppContext } from "../../router"`) keep working:

```typescript
// packages/desktop/src/main/router.ts
export type { AppContext } from "./core/types";
```

**Step 2: Update index.ts to use PluginManager**

Replace the router/handler setup in `packages/desktop/src/main/index.ts`:

Old (lines 6-21):
```typescript
import { RPCHandler } from "@orpc/server/message-port";
import { router } from "./router";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import type { AppContext } from "./router";

const connectionManager = new AcpConnectionManager();
const appContext: AppContext = {
  acpConnectionManager: connectionManager,
};

const handler = new RPCHandler(router);
```

New:
```typescript
import { RPCHandler } from "@orpc/server/message-port";
import { PluginManager } from "./core/plugin-manager";
import { buildRouter } from "./core/router";
import { AcpConnectionManager } from "./features/acp/connection-manager";
import type { AppContext } from "./core/types";
import acpPlugin from "./plugins/acp";

const connectionManager = new AcpConnectionManager();
const appContext: AppContext = {
  acpConnectionManager: connectionManager,
};

const pluginManager = new PluginManager([acpPlugin]);

// Collect contributions and build router synchronously before app.whenReady
// (configContributions is sync for built-in plugins, but we await for future async plugins)
let handler: RPCHandler<any>;

async function initPlugins(): Promise<void> {
  const ctx = { appContext };
  await pluginManager.configContributions(ctx);
  const router = buildRouter(pluginManager.contributions.routers);
  handler = new RPCHandler(router);
  await pluginManager.activate(ctx);
}
```

Update `app.whenReady()` to await plugin init:
```typescript
app.whenReady().then(async () => {
  await initPlugins();
  // ... rest stays the same, but handler.upgrade uses the initialized handler
});
```

Update before-quit:
```typescript
app.on("before-quit", () => {
  void pluginManager.deactivate();
  void connectionManager.disconnectAll();
});
```

**Step 3: Run typecheck**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 4: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/index.ts packages/desktop/src/main/router.ts
git commit -m "feat: wire PluginManager into main entry point"
```

---

### Task 7: Verify shared contract compatibility

**Files:**
- Read (no changes expected): `packages/desktop/src/shared/contract.ts`
- Read (no changes expected): `packages/desktop/src/renderer/src/orpc.ts`

The shared contract `{ ping, acp: acpContract }` and the renderer client `ContractRouterClient<typeof contract>` should still work because the merged router shape matches: `{ ping: handler, acp: { listAgents, connect, ... } }`.

**Step 1: Run full typecheck (both node and web)**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json && bunx tsgo --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 2: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 3: Commit (only if any fixups were needed)**

```bash
git commit -m "fix: ensure contract compatibility with plugin router"
```

---

### Task 8: Create core/index.ts barrel export

**Files:**
- Create: `packages/desktop/src/main/core/index.ts`

**Step 1: Write barrel export**

```typescript
// packages/desktop/src/main/core/index.ts
export { PluginManager } from "./plugin-manager";
export { buildRouter } from "./router";
export type { MainPlugin, MainPluginHooks, MainPluginContributions, PluginContext, AppContext } from "./types";
```

**Step 2: Commit**

```bash
git add packages/desktop/src/main/core/index.ts
git commit -m "feat: add core barrel export for plugin SDK"
```
