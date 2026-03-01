# RendererApp Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `RendererApp` class with plugin system and contribution collection so features can be registered as plugins.

**Architecture:** `RendererApp` is instantiated in `main.tsx` with a `plugins` array. It delegates to `PluginManager` which owns `ContributionRegistry`. During `start()`, `PluginManager.initialize()` hydrates the store, calls `configContributions()` on each plugin (which can read persisted state), merges results via `ContributionRegistry` into a frozen `CollectedContributions`, then runs `activate()` hooks. `RendererApp` then mounts React with the app in context. Layout components read contributions via `useRendererApp()`.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, Vitest 4, `bun` as package manager/runner.

**Design doc:** `docs/designs/2026-03-02-renderer-plugin-system-design.md`

**Deferred:** `app.commands` (CommandRegistry), `app.events` (EventBus) — add when there's a concrete need.

---

### Task 1: Create Disposable and DisposableStore

**Files:**
- Create: `packages/desktop/src/renderer/src/core/disposable.ts`
- Create: `packages/desktop/src/renderer/src/core/__tests__/disposable.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/disposable.test.ts
import { describe, it, expect, vi } from "vitest";
import { DisposableStore, toDisposable } from "../disposable";

describe("toDisposable", () => {
  it("wraps a function into a Disposable", () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    d.dispose();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("DisposableStore", () => {
  it("disposes all pushed disposables", () => {
    const store = new DisposableStore();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    store.push(toDisposable(fn1), toDisposable(fn2));
    store.dispose();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("clears the store after dispose", () => {
    const store = new DisposableStore();
    const fn = vi.fn();
    store.push(toDisposable(fn));
    store.dispose();
    store.dispose(); // second call should not re-invoke
    expect(fn).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/disposable.test.ts`
Expected: FAIL — module not found

**Step 3: Implement**

```typescript
// packages/desktop/src/renderer/src/core/disposable.ts
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

**Step 4: Run tests to verify they pass**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/disposable.test.ts`
Expected: all 3 tests PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add Disposable and DisposableStore"
```

---

### Task 2: Create plugin contribution types

**Files:**
- Create: `packages/desktop/src/renderer/src/core/plugin/contributions.ts`

No tests needed — pure TypeScript type definitions.

**Step 1: Create the file**

```typescript
// packages/desktop/src/renderer/src/core/plugin/contributions.ts
import type React from "react";

export interface PluginContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarPanels?: SidebarPanel[];
  contentPanels?: ContentPanel[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}

export interface ActivityBarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  order?: number;
  /** References a SidebarPanel.id */
  panelId: string;
}

export interface SidebarPanel {
  id: string;
  title: string;
  component: () => Promise<{ default: React.ComponentType }>;
}

export interface ContentPanel {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean;
  component: () => Promise<{
    default: React.ComponentType<{ tab: PluginTab }>;
  }>;
}

/** Minimal tab info passed to content panel components */
export interface PluginTab {
  id: string;
  panelId: string;
  name: string;
  props?: Record<string, unknown>;
}

export interface TitlebarItem {
  id: string;
  order?: number;
  component: () => Promise<{ default: React.ComponentType }>;
}

/** Merged contributions from all registered plugins, frozen at boot */
export interface CollectedContributions {
  activityBarItems: ActivityBarItem[];
  secondarySidebarPanels: SidebarPanel[];
  contentPanels: ContentPanel[];
  primaryTitlebarItems: TitlebarItem[];
  secondaryTitlebarItems: TitlebarItem[];
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/desktop && bun run typecheck`
Expected: no errors related to the new file

**Step 3: Commit**

```bash
git add packages/desktop/src/renderer/src/core/plugin/
git commit -m "feat: add PluginContributions types"
```

---

### Task 3: Create RendererPlugin interface and PluginContext

**Files:**
- Create: `packages/desktop/src/renderer/src/core/plugin/types.ts`
- Create: `packages/desktop/src/renderer/src/core/plugin/index.ts`

**Step 1: Create `types.ts`**

```typescript
// packages/desktop/src/renderer/src/core/plugin/types.ts
import type { PluginContributions } from "./contributions";
import type { RendererApp } from "../app";

export interface PluginContext {
  app: RendererApp;
}

export interface RendererPluginHooks {
  /** Return UI contributions — collected and merged before render */
  configContributions(): PluginContributions;

  /** Called after contributions collected, before React render */
  activate(ctx: PluginContext): void | Promise<void>;

  /** Called on app shutdown */
  deactivate(): void;
}

export type RendererPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<RendererPluginHooks>;
```

**Step 2: Create `index.ts`**

```typescript
// packages/desktop/src/renderer/src/core/plugin/index.ts
export type {
  PluginContributions,
  ActivityBarItem,
  SidebarPanel,
  ContentPanel,
  PluginTab,
  TitlebarItem,
  CollectedContributions,
} from "./contributions";
export type { RendererPlugin, RendererPluginHooks, PluginContext } from "./types";
// PluginManager and ContributionRegistry exported after Task 4
```

**Step 3: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no new errors

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/core/plugin/
git commit -m "feat: add RendererPlugin interface and PluginContext"
```

---

### Task 4: Create ContributionRegistry and PluginManager

**Files:**
- Create: `packages/desktop/src/renderer/src/core/plugin/contribution-registry.ts`
- Create: `packages/desktop/src/renderer/src/core/plugin/plugin-manager.ts`
- Create: `packages/desktop/src/renderer/src/core/__tests__/contribution-registry.test.ts`
- Create: `packages/desktop/src/renderer/src/core/__tests__/plugin-manager.test.ts`

`PluginManager` is renderer-specific (not generic). It owns `ContributionRegistry` and the full plugin lifecycle.

**Step 1: Write ContributionRegistry failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/contribution-registry.test.ts
import { describe, it, expect, vi } from "vitest";
import { ContributionRegistry } from "../plugin/contribution-registry";

describe("ContributionRegistry", () => {
  it("returns empty collections initially", () => {
    const registry = new ContributionRegistry();
    const c = registry.contributions;
    expect(c.activityBarItems).toEqual([]);
    expect(c.secondarySidebarPanels).toEqual([]);
    expect(c.contentPanels).toEqual([]);
    expect(c.primaryTitlebarItems).toEqual([]);
    expect(c.secondaryTitlebarItems).toEqual([]);
  });

  it("merges contributions from multiple plugins", () => {
    const registry = new ContributionRegistry();
    registry.collect([
      { secondarySidebarPanels: [{ id: "a", title: "A", component: vi.fn() }] },
      { secondarySidebarPanels: [{ id: "b", title: "B", component: vi.fn() }] },
    ]);
    expect(registry.contributions.secondarySidebarPanels).toHaveLength(2);
    expect(registry.contributions.secondarySidebarPanels[0].id).toBe("a");
    expect(registry.contributions.secondarySidebarPanels[1].id).toBe("b");
  });

  it("sorts activityBarItems by order ascending", () => {
    const registry = new ContributionRegistry();
    registry.collect([
      {
        activityBarItems: [
          { id: "z", icon: vi.fn(), tooltip: "Z", panelId: "z", order: 30 },
          { id: "a", icon: vi.fn(), tooltip: "A", panelId: "a", order: 10 },
        ],
      },
    ]);
    const items = registry.contributions.activityBarItems;
    expect(items[0].id).toBe("a");
    expect(items[1].id).toBe("z");
  });

  it("places items without order after ordered items", () => {
    const registry = new ContributionRegistry();
    registry.collect([
      {
        activityBarItems: [
          { id: "no-order", icon: vi.fn(), tooltip: "X", panelId: "x" },
          { id: "ordered", icon: vi.fn(), tooltip: "Y", panelId: "y", order: 1 },
        ],
      },
    ]);
    const items = registry.contributions.activityBarItems;
    expect(items[0].id).toBe("ordered");
    expect(items[1].id).toBe("no-order");
  });

  it("freezes contributions after collect", () => {
    const registry = new ContributionRegistry();
    registry.collect([]);
    expect(Object.isFrozen(registry.contributions)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/contribution-registry.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ContributionRegistry**

```typescript
// packages/desktop/src/renderer/src/core/plugin/contribution-registry.ts
import type { CollectedContributions, PluginContributions } from "./contributions";

const EMPTY_CONTRIBUTIONS: CollectedContributions = Object.freeze({
  activityBarItems: [],
  secondarySidebarPanels: [],
  contentPanels: [],
  primaryTitlebarItems: [],
  secondaryTitlebarItems: [],
});

export class ContributionRegistry {
  private _contributions: CollectedContributions = EMPTY_CONTRIBUTIONS;

  get contributions(): CollectedContributions {
    return this._contributions;
  }

  collect(items: PluginContributions[]): void {
    const sortByOrder = <T extends { order?: number }>(list: T[]) =>
      list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

    this._contributions = Object.freeze({
      activityBarItems: sortByOrder(
        items.flatMap((r) => r.activityBarItems ?? []),
      ),
      secondarySidebarPanels: items.flatMap(
        (r) => r.secondarySidebarPanels ?? [],
      ),
      contentPanels: items.flatMap((r) => r.contentPanels ?? []),
      primaryTitlebarItems: sortByOrder(
        items.flatMap((r) => r.primaryTitlebarItems ?? []),
      ),
      secondaryTitlebarItems: sortByOrder(
        items.flatMap((r) => r.secondaryTitlebarItems ?? []),
      ),
    });
  }
}
```

**Step 4: Run ContributionRegistry tests to verify they pass**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/contribution-registry.test.ts`
Expected: all 5 tests PASS

**Step 5: Write PluginManager failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/plugin-manager.test.ts
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin/plugin-manager";
import type { RendererPlugin } from "../plugin";

describe("PluginManager", () => {
  describe("enforce ordering", () => {
    it("sorts plugins: pre → normal → post", () => {
      const plugins: RendererPlugin[] = [
        { name: "normal" },
        { name: "post", enforce: "post" },
        { name: "pre", enforce: "pre" },
      ];
      const pm = new PluginManager(plugins);
      const names = pm.getPlugins().map((p) => p.name);
      expect(names).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("applySeries", () => {
    it("calls hook on each plugin sequentially in enforce order", async () => {
      const calls: string[] = [];
      const plugins: RendererPlugin[] = [
        { name: "normal", activate: () => { calls.push("normal"); } },
        { name: "post", enforce: "post", activate: () => { calls.push("post"); } },
        { name: "pre", enforce: "pre", activate: () => { calls.push("pre"); } },
      ];
      const pm = new PluginManager(plugins);
      await pm.applySeries("activate", { app: {} as any });
      expect(calls).toEqual(["pre", "normal", "post"]);
    });

    it("skips plugins without the hook", async () => {
      const activateFn = vi.fn();
      const plugins: RendererPlugin[] = [
        { name: "no-hook" },
        { name: "has-hook", activate: activateFn },
      ];
      const pm = new PluginManager(plugins);
      await pm.applySeries("activate", { app: {} as any });
      expect(activateFn).toHaveBeenCalledOnce();
    });
  });

  describe("applyParallel", () => {
    it("calls hook on all plugins and returns results", async () => {
      const plugins: RendererPlugin[] = [
        { name: "a", configContributions: () => ({ activityBarItems: [] }) },
        { name: "b", configContributions: () => ({ contentPanels: [] }) },
      ];
      const pm = new PluginManager(plugins);
      const results = await pm.applyParallel("configContributions");
      expect(results).toHaveLength(2);
    });

    it("skips plugins without the hook", async () => {
      const plugins: RendererPlugin[] = [
        { name: "no-hook" },
        { name: "has-hook", configContributions: () => ({}) },
      ];
      const pm = new PluginManager(plugins);
      const results = await pm.applyParallel("configContributions");
      expect(results).toHaveLength(1);
    });
  });

  describe("initialize", () => {
    it("collects contributions from all plugins", async () => {
      const plugins: RendererPlugin[] = [
        {
          name: "a",
          configContributions: () => ({
            secondarySidebarPanels: [{ id: "a", title: "A", component: vi.fn() }],
          }),
        },
        {
          name: "b",
          configContributions: () => ({
            secondarySidebarPanels: [{ id: "b", title: "B", component: vi.fn() }],
          }),
        },
      ];
      const pm = new PluginManager(plugins);
      await pm.initialize({ app: {} as any });
      expect(pm.contributions.secondarySidebarPanels).toHaveLength(2);
    });

    it("calls configContributions before activate", async () => {
      const order: string[] = [];
      const plugins: RendererPlugin[] = [
        {
          name: "test",
          configContributions: () => { order.push("config"); return {}; },
          activate: () => { order.push("activate"); },
        },
      ];
      const pm = new PluginManager(plugins);
      await pm.initialize({ app: {} as any });
      expect(order).toEqual(["config", "activate"]);
    });

    it("passes PluginContext to activate", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", activate: activateFn }]);
      const mockApp = {} as any;
      await pm.initialize({ app: mockApp });
      expect(activateFn).toHaveBeenCalledWith({ app: mockApp });
    });
  });

  describe("shutdown", () => {
    it("calls deactivate on each plugin", async () => {
      const deactivateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", deactivate: deactivateFn }]);
      await pm.shutdown();
      expect(deactivateFn).toHaveBeenCalledOnce();
    });
  });
});
```

**Step 6: Implement PluginManager**

```typescript
// packages/desktop/src/renderer/src/core/plugin/plugin-manager.ts
import type { CollectedContributions, PluginContributions } from "./contributions";
import type { PluginContext, RendererPlugin, RendererPluginHooks } from "./types";
import { ContributionRegistry } from "./contribution-registry";

export class PluginManager {
  private readonly plugins: RendererPlugin[];
  private readonly contributionRegistry = new ContributionRegistry();

  get contributions(): CollectedContributions {
    return this.contributionRegistry.contributions;
  }

  constructor(rawPlugins: RendererPlugin[] = []) {
    this.plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly RendererPlugin[] {
    return this.plugins;
  }

  /** Call hook on each plugin sequentially (enforce order) */
  async applySeries<K extends keyof RendererPluginHooks>(
    hook: K,
    ...args: Parameters<RendererPluginHooks[K]>
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin[hook];
      if (typeof fn === "function") {
        await (fn as Function).call(plugin, ...args);
      }
    }
  }

  /** Call hook on all plugins in parallel, return results */
  async applyParallel<K extends keyof RendererPluginHooks>(
    hook: K,
    ...args: Parameters<RendererPluginHooks[K]>
  ): Promise<ReturnType<RendererPluginHooks[K]>[]> {
    const promises = this.plugins
      .filter((plugin) => typeof plugin[hook] === "function")
      .map((plugin) => {
        const fn = plugin[hook] as Function;
        return fn.call(plugin, ...args);
      });
    return Promise.all(promises) as Promise<ReturnType<RendererPluginHooks[K]>[]>;
  }

  async initialize(ctx: PluginContext): Promise<void> {
    // 1. Collect contributions (parallel)
    const results = await this.applyParallel("configContributions");
    this.contributionRegistry.collect(
      results.filter((r): r is PluginContributions => r != null),
    );

    // 2. Activate (series, enforce order)
    await this.applySeries("activate", ctx);
  }

  async shutdown(): Promise<void> {
    await this.applySeries("deactivate");
  }
}
```

**Step 7: Run all PluginManager tests**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/plugin-manager.test.ts`
Expected: all 9 tests PASS

**Step 8: Update plugin barrel export**

```typescript
// packages/desktop/src/renderer/src/core/plugin/index.ts
export type {
  PluginContributions,
  ActivityBarItem,
  SidebarPanel,
  ContentPanel,
  PluginTab,
  TitlebarItem,
  CollectedContributions,
} from "./contributions";
export type { RendererPlugin, RendererPluginHooks, PluginContext } from "./types";
export { PluginManager } from "./plugin-manager";
export { ContributionRegistry } from "./contribution-registry";
```

**Step 9: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add ContributionRegistry and PluginManager"
```

---

### Task 5: Create RendererApp with unit tests

**Files:**
- Create: `packages/desktop/src/renderer/src/core/__tests__/app.test.ts`
- Create: `packages/desktop/src/renderer/src/core/app.tsx`

RendererApp delegates to PluginManager. Contribution collection and lifecycle tests are already in Task 4. This task tests the integration and React wiring.

**Step 1: Write the failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/app.test.ts
import { describe, it, expect, vi } from "vitest";
import { RendererApp } from "../app";
import type { RendererPlugin } from "../plugin";

describe("RendererApp", () => {
  it("delegates contributions to pluginManager", async () => {
    const app = new RendererApp({
      plugins: [
        {
          name: "a",
          configContributions: () => ({
            secondarySidebarPanels: [{ id: "a", title: "A", component: vi.fn() }],
          }),
        },
      ],
    });
    await app.initialize();
    expect(app.contributions.secondarySidebarPanels).toHaveLength(1);
    expect(app.contributions.secondarySidebarPanels[0].id).toBe("a");
  });

  it("passes itself as PluginContext to activate", async () => {
    const activateFn = vi.fn();
    const app = new RendererApp({
      plugins: [{ name: "test", activate: activateFn }],
    });
    await app.initialize();
    expect(activateFn).toHaveBeenCalledWith({ app });
  });

  it("exposes disposable store", () => {
    const app = new RendererApp({ plugins: [] });
    expect(app.subscriptions).toBeDefined();
    expect(typeof app.subscriptions.push).toBe("function");
    expect(typeof app.subscriptions.dispose).toBe("function");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/app.test.ts`
Expected: FAIL — module not found

**Step 3: Implement RendererApp**

```typescript
// packages/desktop/src/renderer/src/core/app.tsx
import { StrictMode, createContext, useContext } from "react";
import ReactDOM from "react-dom/client";
import { DisposableStore } from "./disposable";
import type { CollectedContributions, RendererPlugin } from "./plugin";
import { PluginManager } from "./plugin";

const RendererAppContext = createContext<RendererApp | null>(null);

export function useRendererApp(): RendererApp {
  const app = useContext(RendererAppContext);
  if (!app) throw new Error("useRendererApp must be used within RendererApp");
  return app;
}

export interface RendererAppOptions {
  plugins?: RendererPlugin[];
}

export class RendererApp {
  private readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();

  get contributions(): CollectedContributions {
    return this.pluginManager.contributions;
  }

  constructor(options: RendererAppOptions = {}) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
  }

  async initialize(): Promise<void> {
    await this.pluginManager.initialize({ app: this });
  }

  async start(): Promise<void> {
    await this.initialize();
    this.render();
  }

  private render(): void {
    const { default: App } = require("../App") as {
      default: React.ComponentType;
    };
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <RendererAppContext.Provider value={this}>
          <App />
        </RendererAppContext.Provider>
      </StrictMode>,
    );
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/app.test.ts`
Expected: all 3 tests PASS

**Step 5: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no new errors

**Step 6: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add RendererApp with plugin delegation"
```

---

### Task 6: Create core barrel export

**Files:**
- Create: `packages/desktop/src/renderer/src/core/index.ts`

**Step 1: Create the file**

```typescript
// packages/desktop/src/renderer/src/core/index.ts
export { RendererApp, useRendererApp } from "./app";
export type { RendererAppOptions } from "./app";
export type {
  RendererPlugin,
  RendererPluginHooks,
  PluginContext,
  PluginContributions,
  CollectedContributions,
  ActivityBarItem,
  SidebarPanel,
  ContentPanel,
  PluginTab,
  TitlebarItem,
} from "./plugin";
export { PluginManager } from "./plugin";
export type { Disposable } from "./disposable";
export { DisposableStore, toDisposable } from "./disposable";
```

**Step 2: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no new errors

**Step 3: Commit**

```bash
git add packages/desktop/src/renderer/src/core/index.ts
git commit -m "feat: add core barrel export"
```

---

### Task 7: Wire RendererApp into main.tsx

**Files:**
- Modify: `packages/desktop/src/renderer/src/main.tsx`

**Step 1: Replace with RendererApp.start()**

```typescript
// packages/desktop/src/renderer/src/main.tsx
import "./assets/main.css";
import { RendererApp } from "./core";

const app = new RendererApp({
  plugins: [
    // Plugins will be registered here
  ],
});

app.start();
```

**Step 2: Run all tests**

Run: `cd packages/desktop && bun run test:run`
Expected: all tests pass

**Step 3: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no errors

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/main.tsx
git commit -m "feat: wire RendererApp into main.tsx"
```

---

### Task 8: Update App.tsx to use useRendererApp

**Files:**
- Modify: `packages/desktop/src/renderer/src/App.tsx`

**Step 1: Add useRendererApp and verify access to contributions**

```typescript
// packages/desktop/src/renderer/src/App.tsx
import { AgentChat } from "./features/acp";
import { useRendererApp } from "./core";
import {
  AppLayoutActivityBar,
  AppLayoutChatPanel,
  AppLayoutContentPanel,
  AppLayoutPanelSeparator,
  AppLayoutPrimarySidebar,
  AppLayoutPrimaryTitleBar,
  AppLayoutRoot,
  AppLayoutSecondarySidebar,
  AppLayoutSecondaryTitleBar,
  AppLayoutTitleBar,
  AppLayoutTrafficLights,
} from "./components/app-layout";
import { ThemeToggle } from "./components/ui/theme-toggle";

export default function App() {
  // Plugin contributions available here for future layout integration
  const _app = useRendererApp();

  return (
    <AppLayoutRoot>
      <AppLayoutTrafficLights />

      <AppLayoutPrimarySidebar>
        <div className="flex h-full flex-col p-3">
          <h2 className="text-xs font-semibold text-muted-foreground">Sessions</h2>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          </div>
        </div>
        <div className="mt-auto ml-auto px-1.5 pb-1.5">
          <ThemeToggle />
        </div>
      </AppLayoutPrimarySidebar>

      <AppLayoutPanelSeparator panelId="primarySidebar" />

      <div className="mb-2 flex min-w-0 flex-1 flex-col">
        <AppLayoutTitleBar>
          <AppLayoutPrimaryTitleBar />
          <AppLayoutSecondaryTitleBar />
        </AppLayoutTitleBar>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1">
            <AppLayoutChatPanel>
              <AgentChat />
            </AppLayoutChatPanel>

            <AppLayoutPanelSeparator panelId="contentPanel" />

            <AppLayoutContentPanel>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Content</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">Terminal, editor, browser</p>
                </div>
              </div>
            </AppLayoutContentPanel>

            <AppLayoutPanelSeparator panelId="secondarySidebar" />

            <AppLayoutSecondarySidebar>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Files</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">File tree</p>
                </div>
              </div>
            </AppLayoutSecondarySidebar>
          </div>

          <AppLayoutActivityBar />
        </div>
      </div>
    </AppLayoutRoot>
  );
}
```

**Step 2: Run all tests**

Run: `cd packages/desktop && bun run test:run`
Expected: all tests pass

**Step 3: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no errors

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/App.tsx
git commit -m "feat: use useRendererApp in App.tsx"
```

---

## Done

At this point:
- `src/renderer/src/core/` contains the plugin system
- `RendererApp` collects plugin contributions, runs lifecycle hooks, exposes subscriptions
- `main.tsx` instantiates `RendererApp` — new plugins are added to the `plugins` array
- `App.tsx` has access to contributions via `useRendererApp()`
- All existing functionality unchanged — ACP chat still works
- Unit tests covering: Disposable, PluginManager, RendererApp (contributions + lifecycle)
- `app.commands` and `app.events` deferred — add when needed
- Built-in features can be registered as plugins in future tasks
