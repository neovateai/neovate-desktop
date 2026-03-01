# RendererApp Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `RendererApp` class and plugin system to neovate-desktop's renderer so future features can register UI contributions (activity bar items, sidebar panels, content panels, titlebar items) as plugins.

**Architecture:** `RendererApp` is instantiated in `main.tsx` with a `plugins` array, collects each plugin's static `contributions` property, runs `beforeRender` hooks, then mounts React with the app in context. `App.tsx` reads contributions via `useRendererApp()`. ACP chat stays wired directly in `App.tsx`.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, Vitest 4, `bun` as package manager/runner.

---

### Task 1: Create plugin contribution types

**Files:**
- Create: `packages/desktop/src/renderer/src/core/plugin/contributions.ts`

No tests needed — pure TypeScript type definitions.

**Step 1: Create the file**

```typescript
// packages/desktop/src/renderer/src/core/plugin/contributions.ts
import type React from "react";
import type { RendererApp } from "../app";

export interface PluginContributions {
  activityBarItems?: ActivityBarItem[];
  primarySidebarPanels?: SidebarPanel[];
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
  /** ID of a panel in primarySidebarPanels or secondarySidebarPanels */
  panelId: string;
}

export interface SidebarPanel {
  id: string;
  title: string;
  componentLoader: () => Promise<{
    default: React.ComponentType<{ app: RendererApp }>;
  }>;
}

export interface ContentPanel {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** If true, only one tab instance of this panel is allowed at a time */
  singleton?: boolean;
  componentLoader: () => Promise<{
    default: React.ComponentType<{
      app: RendererApp;
      props: Record<string, unknown>;
    }>;
  }>;
}

export interface TitlebarItem {
  id: string;
  componentLoader: () => Promise<{
    default: React.ComponentType<{ app: RendererApp }>;
  }>;
}

/** Merged contributions from all registered plugins */
export interface CollectedContributions {
  activityBarItems: ActivityBarItem[];
  primarySidebarPanels: SidebarPanel[];
  secondarySidebarPanels: SidebarPanel[];
  contentPanels: ContentPanel[];
  primaryTitlebarItems: TitlebarItem[];
  secondaryTitlebarItems: TitlebarItem[];
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/desktop && bun run typecheck`
Expected: no errors related to the new file (ignore pre-existing errors if any)

**Step 3: Commit**

```bash
git add packages/desktop/src/renderer/src/core/plugin/contributions.ts
git commit -m "feat: add PluginContributions types"
```

---

### Task 2: Create RendererPlugin interface

**Files:**
- Create: `packages/desktop/src/renderer/src/core/plugin/types.ts`
- Create: `packages/desktop/src/renderer/src/core/plugin/index.ts`

**Step 1: Create `types.ts`**

`RendererPlugin` forward-references `RendererApp` to avoid a circular import — `app.tsx` imports from `plugin/`, not the other way around. Use `import type` only.

```typescript
// packages/desktop/src/renderer/src/core/plugin/types.ts
import type { PluginContributions } from "./contributions";
import type { RendererApp } from "../app";

export interface RendererPlugin {
  name: string;
  contributions?: PluginContributions;
  beforeRender?: (ctx: { app: RendererApp }) => void | Promise<void>;
}
```

**Step 2: Create `index.ts`**

```typescript
// packages/desktop/src/renderer/src/core/plugin/index.ts
export type {
  PluginContributions,
  ActivityBarItem,
  SidebarPanel,
  ContentPanel,
  TitlebarItem,
  CollectedContributions,
} from "./contributions";
export type { RendererPlugin } from "./types";
```

**Step 3: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no new errors

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/core/plugin/
git commit -m "feat: add RendererPlugin interface"
```

---

### Task 3: Create RendererApp with unit tests

**Files:**
- Create: `packages/desktop/src/renderer/src/core/__tests__/app.test.ts`
- Create: `packages/desktop/src/renderer/src/core/app.tsx`

**Step 1: Write the failing tests**

```typescript
// packages/desktop/src/renderer/src/core/__tests__/app.test.ts
import { describe, it, expect, vi } from "vitest";
import { RendererApp } from "../app";

describe("RendererApp", () => {
  describe("contributions", () => {
    it("returns empty collections when no plugins registered", () => {
      const app = new RendererApp({ plugins: [] });
      const c = app.contributions;
      expect(c.activityBarItems).toEqual([]);
      expect(c.primarySidebarPanels).toEqual([]);
      expect(c.secondarySidebarPanels).toEqual([]);
      expect(c.contentPanels).toEqual([]);
      expect(c.primaryTitlebarItems).toEqual([]);
      expect(c.secondaryTitlebarItems).toEqual([]);
    });

    it("collects contributions from all plugins", () => {
      const app = new RendererApp({
        plugins: [
          {
            name: "a",
            contributions: {
              primarySidebarPanels: [{ id: "a-panel", title: "A", componentLoader: vi.fn() }],
            },
          },
          {
            name: "b",
            contributions: {
              primarySidebarPanels: [{ id: "b-panel", title: "B", componentLoader: vi.fn() }],
            },
          },
        ],
      });
      expect(app.contributions.primarySidebarPanels).toHaveLength(2);
      expect(app.contributions.primarySidebarPanels[0].id).toBe("a-panel");
      expect(app.contributions.primarySidebarPanels[1].id).toBe("b-panel");
    });

    it("sorts activityBarItems by order ascending", () => {
      const app = new RendererApp({
        plugins: [
          {
            name: "a",
            contributions: {
              activityBarItems: [
                { id: "z", icon: vi.fn(), tooltip: "Z", panelId: "z", order: 30 },
                { id: "a", icon: vi.fn(), tooltip: "A", panelId: "a", order: 10 },
              ],
            },
          },
        ],
      });
      const items = app.contributions.activityBarItems;
      expect(items[0].id).toBe("a");
      expect(items[1].id).toBe("z");
    });

    it("places items without order after ordered items", () => {
      const app = new RendererApp({
        plugins: [
          {
            name: "a",
            contributions: {
              activityBarItems: [
                { id: "no-order", icon: vi.fn(), tooltip: "X", panelId: "x" },
                { id: "ordered", icon: vi.fn(), tooltip: "Y", panelId: "y", order: 1 },
              ],
            },
          },
        ],
      });
      const items = app.contributions.activityBarItems;
      expect(items[0].id).toBe("ordered");
      expect(items[1].id).toBe("no-order");
    });
  });

  describe("beforeRender hooks", () => {
    it("calls beforeRender on each plugin in registration order", async () => {
      const calls: string[] = [];
      const app = new RendererApp({
        plugins: [
          { name: "first", beforeRender: () => { calls.push("first"); } },
          { name: "second", beforeRender: async () => { calls.push("second"); } },
        ],
      });
      await app.runBeforeRender();
      expect(calls).toEqual(["first", "second"]);
    });

    it("awaits async beforeRender before calling next", async () => {
      const order: number[] = [];
      const app = new RendererApp({
        plugins: [
          {
            name: "slow",
            beforeRender: () =>
              new Promise<void>((resolve) =>
                setTimeout(() => { order.push(1); resolve(); }, 10)
              ),
          },
          { name: "fast", beforeRender: () => { order.push(2); } },
        ],
      });
      await app.runBeforeRender();
      expect(order).toEqual([1, 2]);
    });

    it("skips plugins without beforeRender", async () => {
      const app = new RendererApp({
        plugins: [{ name: "no-hook" }],
      });
      await expect(app.runBeforeRender()).resolves.toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun run test --run src/renderer/src/core/__tests__/app.test.ts`
Expected: FAIL — `../app` module not found

**Step 3: Implement RendererApp**

```typescript
// packages/desktop/src/renderer/src/core/app.tsx
import { StrictMode, createContext, useContext } from "react";
import ReactDOM from "react-dom/client";
import type { CollectedContributions, RendererPlugin } from "./plugin";

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
  readonly plugins: RendererPlugin[];

  constructor(options: RendererAppOptions = {}) {
    this.plugins = options.plugins ?? [];
  }

  get contributions(): CollectedContributions {
    const activityBarItems = this.plugins
      .flatMap((p) => p.contributions?.activityBarItems ?? [])
      .sort((a, b) => {
        const aOrder = a.order ?? Infinity;
        const bOrder = b.order ?? Infinity;
        return aOrder - bOrder;
      });

    return {
      activityBarItems,
      primarySidebarPanels: this.plugins.flatMap((p) => p.contributions?.primarySidebarPanels ?? []),
      secondarySidebarPanels: this.plugins.flatMap((p) => p.contributions?.secondarySidebarPanels ?? []),
      contentPanels: this.plugins.flatMap((p) => p.contributions?.contentPanels ?? []),
      primaryTitlebarItems: this.plugins.flatMap((p) => p.contributions?.primaryTitlebarItems ?? []),
      secondaryTitlebarItems: this.plugins.flatMap((p) => p.contributions?.secondaryTitlebarItems ?? []),
    };
  }

  /** Run all plugin beforeRender hooks sequentially */
  async runBeforeRender(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.beforeRender?.({ app: this });
    }
  }

  async start(): Promise<void> {
    await this.runBeforeRender();
    this.render();
  }

  private render(): void {
    // Dynamic require avoids circular import at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: App } = require("../App") as { default: React.ComponentType };
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
Expected: all 6 tests PASS

**Step 5: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no new errors

**Step 6: Commit**

```bash
git add packages/desktop/src/renderer/src/core/
git commit -m "feat: add RendererApp with plugin contribution collection"
```

---

### Task 4: Create barrel export

**Files:**
- Create: `packages/desktop/src/renderer/src/core/index.ts`

**Step 1: Create the file**

```typescript
// packages/desktop/src/renderer/src/core/index.ts
export { RendererApp, useRendererApp } from "./app";
export type { RendererAppOptions } from "./app";
export type { RendererPlugin } from "./plugin";
export type {
  PluginContributions,
  CollectedContributions,
  ActivityBarItem,
  SidebarPanel,
  ContentPanel,
  TitlebarItem,
} from "./plugin";
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

### Task 5: Wire RendererApp into main.tsx

**Files:**
- Modify: `packages/desktop/src/renderer/src/main.tsx`

Current content:
```typescript
import "./assets/main.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 1: Replace with RendererApp.start()**

```typescript
// packages/desktop/src/renderer/src/main.tsx
import "./assets/main.css";
import { RendererApp } from "./core";

const app = new RendererApp({
  plugins: [
    // Register plugins here as they are created
  ],
});

app.start();
```

**Step 2: Verify the app still renders**

Run: `cd packages/desktop && bun run dev`
Expected: Electron opens, app displays "Neovate Desktop" header with AgentChat as before. No console errors.

**Step 3: Run all tests**

Run: `cd packages/desktop && bun run test:run`
Expected: all tests pass

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/main.tsx
git commit -m "feat: wire RendererApp into main.tsx"
```

---

### Task 6: Expose contributions in App.tsx via useRendererApp

**Files:**
- Modify: `packages/desktop/src/renderer/src/App.tsx`

**Step 1: Update App.tsx**

```typescript
// packages/desktop/src/renderer/src/App.tsx
import { AgentChat } from "./features/acp";
import { useRendererApp } from "./core";

export default function App() {
  const app = useRendererApp();
  // app.contributions is available here for layout components
  // e.g. app.contributions.activityBarItems, app.contributions.secondarySidebarPanels
  // ACP chat is built-in, not plugin-driven
  void app; // will be used as layout components are added

  return (
    <div data-testid="app-root" className="flex h-screen flex-col">
      <header className="flex items-center border-b border-border px-4 py-2">
        <h1 data-testid="app-title" className="text-sm font-semibold">
          Neovate Desktop
        </h1>
      </header>
      <main className="flex-1 overflow-hidden">
        <AgentChat />
      </main>
    </div>
  );
}
```

**Step 2: Run all tests**

Run: `cd packages/desktop && bun run test:run`
Expected: all tests pass

**Step 3: Verify TypeScript**

Run: `cd packages/desktop && bun run typecheck`
Expected: no errors

**Step 4: Verify app renders**

Run: `cd packages/desktop && bun run dev`
Expected: same visual output as before — no regression

**Step 5: Commit**

```bash
git add packages/desktop/src/renderer/src/App.tsx
git commit -m "feat: expose plugin contributions in App.tsx via useRendererApp"
```

---

## Done

At this point:
- `src/renderer/src/core/` contains the full plugin system
- `RendererApp` collects plugin contributions and runs `beforeRender` hooks
- `main.tsx` instantiates `RendererApp` — new plugins are added to the `plugins` array
- `App.tsx` has access to contributions via `useRendererApp()`
- All existing functionality is unchanged — ACP chat still works as before
- 6 unit tests covering contribution collection and hook ordering
