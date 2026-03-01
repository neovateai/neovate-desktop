# RendererApp Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `RendererApp` class with plugin system and contribution collection so features can be registered as plugins.

**Architecture:** `RendererApp` is instantiated in `main.tsx` with a `plugins` array. It delegates to `PluginManager`. During `start()`, `PluginManager.initialize()` hydrates the store, calls `configContributions()` on each plugin (which can read persisted state), merges results into `Required<PluginContributions>`, then runs `activate()` hooks. `RendererApp` then mounts React with the app in context. Layout components read contributions via `useRendererApp()`.

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
  } from "./contributions";
export type { RendererPlugin, RendererPluginHooks, PluginContext } from "./types";
// PluginManager exported after Task 4
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
- Create: `packages/desktop/src/renderer/src/core/plugin/plugin-manager.ts`
- Create: `packages/desktop/src/renderer/src/core/__tests__/plugin-manager.test.ts`

`PluginManager` is renderer-specific (not generic). Owns plugin lifecycle and contribution merging (no separate ContributionRegistry).

**Step 1: Write failing tests**

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

  describe("configContributions", () => {
    it("merges contributions from all plugins", async () => {
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
      await pm.configContributions();
      expect(pm.contributions.secondarySidebarPanels).toHaveLength(2);
    });

    it("sorts activityBarItems by order", async () => {
      const pm = new PluginManager([{
        name: "test",
        configContributions: () => ({
          activityBarItems: [
            { id: "z", icon: vi.fn(), tooltip: "Z", panelId: "z", order: 30 },
            { id: "a", icon: vi.fn(), tooltip: "A", panelId: "a", order: 10 },
          ],
        }),
      }]);
      await pm.configContributions();
      expect(pm.contributions.activityBarItems[0].id).toBe("a");
      expect(pm.contributions.activityBarItems[1].id).toBe("z");
    });

    it("returns empty contributions when no plugins", async () => {
      const pm = new PluginManager([]);
      await pm.configContributions();
      expect(pm.contributions.activityBarItems).toEqual([]);
      expect(pm.contributions.secondarySidebarPanels).toEqual([]);
      expect(pm.contributions.contentPanels).toEqual([]);
    });

    it("skips plugins without configContributions", async () => {
      const pm = new PluginManager([
        { name: "no-hook" },
        { name: "has-hook", configContributions: () => ({
          contentPanels: [{ id: "p", name: "P", component: vi.fn() }],
        }) },
      ]);
      await pm.configContributions();
      expect(pm.contributions.contentPanels).toHaveLength(1);
    });
  });

  describe("activate", () => {
    it("calls activate on each plugin with PluginContext", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", activate: activateFn }]);
      const mockApp = {} as any;
      await pm.activate({ app: mockApp });
      expect(activateFn).toHaveBeenCalledWith({ app: mockApp });
    });

    it("calls activate in enforce order", async () => {
      const calls: string[] = [];
      const plugins: RendererPlugin[] = [
        { name: "normal", activate: () => { calls.push("normal"); } },
        { name: "post", enforce: "post", activate: () => { calls.push("post"); } },
        { name: "pre", enforce: "pre", activate: () => { calls.push("pre"); } },
      ];
      const pm = new PluginManager(plugins);
      await pm.activate({ app: {} as any });
      expect(calls).toEqual(["pre", "normal", "post"]);
    });

    it("skips plugins without activate", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([
        { name: "no-hook" },
        { name: "has-hook", activate: activateFn },
      ]);
      await pm.activate({ app: {} as any });
      expect(activateFn).toHaveBeenCalledOnce();
    });
  });

  describe("deactivate", () => {
    it("calls deactivate on each plugin", async () => {
      const deactivateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", deactivate: deactivateFn }]);
      await pm.deactivate();
      expect(deactivateFn).toHaveBeenCalledOnce();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/plugin-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement PluginManager**

```typescript
// packages/desktop/src/renderer/src/core/plugin/plugin-manager.ts
import type { PluginContributions } from "./contributions";
import type { PluginContext, RendererPlugin, RendererPluginHooks } from "./types";

const EMPTY_CONTRIBUTIONS: Required<PluginContributions> = {
  activityBarItems: [],
  secondarySidebarPanels: [],
  contentPanels: [],
  primaryTitlebarItems: [],
  secondaryTitlebarItems: [],
};

function mergeContributions(items: PluginContributions[]): Required<PluginContributions> {
  const sortByOrder = <T extends { order?: number }>(list: T[]) =>
    list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return {
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
  };
}

export class PluginManager {
  private readonly plugins: RendererPlugin[];
  contributions: Required<PluginContributions> = EMPTY_CONTRIBUTIONS;

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

  /** Collect and merge configContributions from all plugins (parallel) */
  async configContributions(): Promise<void> {
    const results = await this.applyParallel("configContributions");
    this.contributions = mergeContributions(
      results.filter((r): r is PluginContributions => r != null),
    );
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    await this.applySeries("activate", ctx);
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
    await this.applySeries("deactivate");
  }

  private async applySeries<K extends keyof RendererPluginHooks>(
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

  private async applyParallel<K extends keyof RendererPluginHooks>(
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
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/plugin-manager.test.ts`
Expected: all 10 tests PASS

**Step 5: Update plugin barrel export**

```typescript
// packages/desktop/src/renderer/src/core/plugin/index.ts
export type {
  PluginContributions,
  ActivityBarItem,
  SidebarPanel,
  ContentPanel,
  PluginTab,
  TitlebarItem,
  } from "./contributions";
export type { RendererPlugin, RendererPluginHooks, PluginContext } from "./types";
export { PluginManager } from "./plugin-manager";
```

**Step 6: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add PluginManager with lifecycle and contribution merging"
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
  it("exposes pluginManager", () => {
    const app = new RendererApp({ plugins: [] });
    expect(app.pluginManager).toBeDefined();
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
import type { RendererPlugin } from "./plugin";
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
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();

  constructor(options: RendererAppOptions = {}) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
  }

  async start(): Promise<void> {
    await this.pluginManager.configContributions();
    await this.pluginManager.activate({ app: this });
    await this.render();
  }

  private async render(): Promise<void> {
    const { default: App } = await import("../App");
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
Expected: 2 tests PASS

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
