# RendererApp Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `RendererApp` class with plugin system and contribution collection so features can be registered as plugins.

**Architecture:** `RendererApp` is instantiated in `main.tsx` with a `plugins` array. During `start()`, it calls `configContributions()` on each plugin, merges results into a frozen `CollectedContributions`, runs `activate()` hooks, then mounts React with the app in context. Layout components read contributions via `useRendererApp()`.

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

### Task 4: Create PluginManager

**Files:**
- Create: `packages/desktop/src/renderer/src/core/plugin-manager.ts`
- Create: `packages/desktop/src/renderer/src/core/__tests__/plugin-manager.test.ts`

Ported from neovate-code-desktop. Only the methods needed by RendererApp: `applyParallel` (for configContributions) and `applySeries` (for activate/deactivate).

**Step 1: Write the failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/plugin-manager.test.ts
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin-manager";

interface TestHooks {
  hook(this: { ctx: string }, arg: number): string;
}

type TestPlugin = { name: string; enforce?: "pre" | "post" } & Partial<TestHooks>;

describe("PluginManager", () => {
  describe("enforce ordering", () => {
    it("sorts plugins: pre → normal → post", () => {
      const plugins: TestPlugin[] = [
        { name: "normal" },
        { name: "post", enforce: "post" },
        { name: "pre", enforce: "pre" },
      ];
      const pm = new PluginManager<TestHooks>(plugins);
      const names = pm.getPlugins().map((p) => p.name);
      expect(names).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("applySeries", () => {
    it("calls hook on each plugin in order", async () => {
      const calls: string[] = [];
      const plugins: TestPlugin[] = [
        { name: "a", hook() { calls.push("a"); return "a"; } },
        { name: "b", hook() { calls.push("b"); return "b"; } },
      ];
      const pm = new PluginManager<TestHooks>(plugins);
      await pm.applySeries("hook", { ctx: "test" }, 1);
      expect(calls).toEqual(["a", "b"]);
    });

    it("skips plugins without the hook", async () => {
      const plugins: TestPlugin[] = [
        { name: "no-hook" },
        { name: "has-hook", hook() { return "ok"; } },
      ];
      const pm = new PluginManager<TestHooks>(plugins);
      await expect(pm.applySeries("hook", { ctx: "test" }, 1)).resolves.toBeUndefined();
    });
  });

  describe("applyParallel", () => {
    it("calls all plugins and returns results", async () => {
      const plugins: TestPlugin[] = [
        { name: "a", hook() { return "a-result"; } },
        { name: "b", hook() { return "b-result"; } },
      ];
      const pm = new PluginManager<TestHooks>(plugins);
      const results = await pm.applyParallel("hook", { ctx: "test" }, 1);
      expect(results).toEqual(["a-result", "b-result"]);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/plugin-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement**

```typescript
// packages/desktop/src/renderer/src/core/plugin-manager.ts

/**
 * Type-safe Plugin Manager for renderer process.
 * Plugins are sorted by enforce ordering: pre → normal → post.
 */

type DefinePlugin<H> = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<H>;

/** Extract `this` context from a hook function */
type HookContext<H, K extends keyof H> = H[K] extends (
  this: infer C,
  ...args: never[]
) => unknown
  ? C
  : unknown;

/** Extract argument types from hook function (excluding `this`) */
type HookArgs<H, K extends keyof H> = H[K] extends (
  this: unknown,
  ...args: infer A
) => unknown
  ? A
  : H[K] extends (...args: infer A) => unknown
    ? A
    : never;

/** Extract return type from hook function (awaited) */
type HookReturn<H, K extends keyof H> = H[K] extends (
  ...args: never[]
) => infer R
  ? Awaited<R>
  : never;

export class PluginManager<H extends object> {
  readonly #plugins: DefinePlugin<H>[];

  constructor(rawPlugins: DefinePlugin<H>[] = []) {
    this.#plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly DefinePlugin<H>[] {
    return this.#plugins;
  }

  /** Call hook on each plugin sequentially */
  async applySeries<K extends keyof H>(
    hook: K,
    context: HookContext<H, K>,
    ...args: HookArgs<H, K>
  ): Promise<void> {
    for (const plugin of this.#plugins) {
      const fn = plugin[hook];
      if (typeof fn === "function") {
        await fn.call(context, ...args);
      }
    }
  }

  /** Call hook on all plugins in parallel, return results */
  async applyParallel<K extends keyof H>(
    hook: K,
    context: HookContext<H, K>,
    ...args: HookArgs<H, K>
  ): Promise<HookReturn<H, K>[]> {
    const promises = this.#plugins
      .filter((plugin) => typeof plugin[hook] === "function")
      .map((plugin) => {
        const fn = plugin[hook] as (...a: unknown[]) => unknown;
        return fn.call(context, ...args);
      });
    return Promise.all(promises) as Promise<HookReturn<H, K>[]>;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/plugin-manager.test.ts`
Expected: all 5 tests PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add PluginManager with enforce ordering"
```

---

### Task 5: Create RendererApp with unit tests

**Files:**
- Create: `packages/desktop/src/renderer/src/core/__tests__/app.test.ts`
- Create: `packages/desktop/src/renderer/src/core/app.tsx`

**Step 1: Write the failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/app.test.ts
import { describe, it, expect, vi } from "vitest";
import { RendererApp } from "../app";
import type { RendererPlugin } from "../plugin";

describe("RendererApp", () => {
  describe("contributions", () => {
    it("returns empty collections when no plugins registered", async () => {
      const app = new RendererApp({ plugins: [] });
      await app.initialize();
      const c = app.contributions;
      expect(c.activityBarItems).toEqual([]);
      expect(c.secondarySidebarPanels).toEqual([]);
      expect(c.contentPanels).toEqual([]);
      expect(c.primaryTitlebarItems).toEqual([]);
      expect(c.secondaryTitlebarItems).toEqual([]);
    });

    it("collects contributions from all plugins", async () => {
      const app = new RendererApp({
        plugins: [
          {
            name: "a",
            configContributions: () => ({
              secondarySidebarPanels: [
                { id: "a-panel", title: "A", component: vi.fn() },
              ],
            }),
          },
          {
            name: "b",
            configContributions: () => ({
              secondarySidebarPanels: [
                { id: "b-panel", title: "B", component: vi.fn() },
              ],
            }),
          },
        ],
      });
      await app.initialize();
      expect(app.contributions.secondarySidebarPanels).toHaveLength(2);
      expect(app.contributions.secondarySidebarPanels[0].id).toBe("a-panel");
      expect(app.contributions.secondarySidebarPanels[1].id).toBe("b-panel");
    });

    it("sorts activityBarItems by order ascending", async () => {
      const app = new RendererApp({
        plugins: [
          {
            name: "a",
            configContributions: () => ({
              activityBarItems: [
                { id: "z", icon: vi.fn(), tooltip: "Z", panelId: "z", order: 30 },
                { id: "a", icon: vi.fn(), tooltip: "A", panelId: "a", order: 10 },
              ],
            }),
          },
        ],
      });
      await app.initialize();
      const items = app.contributions.activityBarItems;
      expect(items[0].id).toBe("a");
      expect(items[1].id).toBe("z");
    });

    it("places items without order after ordered items", async () => {
      const app = new RendererApp({
        plugins: [
          {
            name: "a",
            configContributions: () => ({
              activityBarItems: [
                { id: "no-order", icon: vi.fn(), tooltip: "X", panelId: "x" },
                { id: "ordered", icon: vi.fn(), tooltip: "Y", panelId: "y", order: 1 },
              ],
            }),
          },
        ],
      });
      await app.initialize();
      const items = app.contributions.activityBarItems;
      expect(items[0].id).toBe("ordered");
      expect(items[1].id).toBe("no-order");
    });

    it("contributions are frozen after initialize", async () => {
      const app = new RendererApp({ plugins: [] });
      await app.initialize();
      expect(Object.isFrozen(app.contributions)).toBe(true);
    });
  });

  describe("activate lifecycle", () => {
    it("calls activate on each plugin with PluginContext", async () => {
      const activateFn = vi.fn();
      const app = new RendererApp({
        plugins: [{ name: "test", activate: activateFn }],
      });
      await app.initialize();
      expect(activateFn).toHaveBeenCalledWith({ app });
    });

    it("calls activate in enforce order", async () => {
      const calls: string[] = [];
      const plugins: RendererPlugin[] = [
        { name: "normal", activate: () => { calls.push("normal"); } },
        { name: "post", enforce: "post", activate: () => { calls.push("post"); } },
        { name: "pre", enforce: "pre", activate: () => { calls.push("pre"); } },
      ];
      const app = new RendererApp({ plugins });
      await app.initialize();
      expect(calls).toEqual(["pre", "normal", "post"]);
    });

    it("calls configContributions before activate", async () => {
      const order: string[] = [];
      const app = new RendererApp({
        plugins: [
          {
            name: "test",
            configContributions: () => { order.push("config"); return {}; },
            activate: () => { order.push("activate"); },
          },
        ],
      });
      await app.initialize();
      expect(order).toEqual(["config", "activate"]);
    });
  });

  describe("subscriptions", () => {
    it("exposes disposable store on app", () => {
      const app = new RendererApp({ plugins: [] });
      expect(app.subscriptions).toBeDefined();
      expect(typeof app.subscriptions.push).toBe("function");
      expect(typeof app.subscriptions.dispose).toBe("function");
    });
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
import type {
  CollectedContributions,
  PluginContributions,
  RendererPlugin,
  RendererPluginHooks,
} from "./plugin";
import { PluginManager } from "./plugin-manager";

const EMPTY_CONTRIBUTIONS: CollectedContributions = Object.freeze({
  activityBarItems: [],
  secondarySidebarPanels: [],
  contentPanels: [],
  primaryTitlebarItems: [],
  secondaryTitlebarItems: [],
});

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
  private pluginManager: PluginManager<RendererPluginHooks>;

  readonly subscriptions = new DisposableStore();

  private _contributions: CollectedContributions = EMPTY_CONTRIBUTIONS;

  get contributions(): CollectedContributions {
    return this._contributions;
  }

  constructor(options: RendererAppOptions = {}) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
  }

  /**
   * Collect contributions and run activate hooks.
   * Called before React render. Separated from start() for testability.
   */
  async initialize(): Promise<void> {
    // 1. Collect contributions (parallel)
    const results = await this.pluginManager.applyParallel(
      "configContributions",
      {},
    );
    const contributions = results.filter(
      (r): r is PluginContributions => r != null,
    );
    this._contributions = this.mergeContributions(contributions);

    // 2. Run activate hooks (series, enforce order)
    await this.pluginManager.applySeries("activate", {}, { app: this });
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

  private mergeContributions(
    results: PluginContributions[],
  ): CollectedContributions {
    const sortByOrder = <T extends { order?: number }>(items: T[]) =>
      items.sort(
        (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity),
      );

    return Object.freeze({
      activityBarItems: sortByOrder(
        results.flatMap((r) => r.activityBarItems ?? []),
      ),
      secondarySidebarPanels: results.flatMap(
        (r) => r.secondarySidebarPanels ?? [],
      ),
      contentPanels: results.flatMap((r) => r.contentPanels ?? []),
      primaryTitlebarItems: sortByOrder(
        results.flatMap((r) => r.primaryTitlebarItems ?? []),
      ),
      secondaryTitlebarItems: sortByOrder(
        results.flatMap((r) => r.secondaryTitlebarItems ?? []),
      ),
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/app.test.ts`
Expected: all 9 tests PASS

**Step 5: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no new errors

**Step 6: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add RendererApp with plugin lifecycle and contribution collection"
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
