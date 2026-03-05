# Content Panel Tabs Design

**Date:** 2026-03-03
**Branch:** feat/content-panel-tabs

## Overview

A multi-tab system for the content panel supporting singleton and multi-instance views, per-project persistence, and a plugin API accessible from both renderer and main process.

---

## Concepts

### View

A view is a content type registered by a plugin. Uses `ContentPanelView` from `contributions.ts`:

```ts
interface ContentPanelView {
  id: string; // "terminal", "editor", "browser", "review"
  name: string; // "Terminal", "Editor"
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean; // default true; per-project scope
  deactivation?: "hidden" | "activity" | "unmount"; // default "hidden"
  component: () => Promise<{ default: React.ComponentType }>; // no props — uses hooks
}
```

Views are contributed via `PluginContributions.contentPanelViews` and collected by `PluginManager` at startup. Components use `useInstanceId()` and `useViewState()` hooks (provided via context by the tab system) — no props needed.

**`deactivation`** controls what happens when a tab is not active:

| Mode                 | Hidden behavior       | Effects          | DOM       | Use case                                       |
| -------------------- | --------------------- | ---------------- | --------- | ---------------------------------------------- |
| `"hidden"` (default) | CSS `display:none`    | Keep running     | Preserved | Terminal (subscriptions must stay alive)       |
| `"activity"`         | React 19 `<Activity>` | Teardown on hide | Preserved | Editor, Browser (free resources, fast restore) |
| `"unmount"`          | Unmount component     | Teardown on hide | Removed   | Lightweight views (full memory release)        |

Currently all views use `"hidden"` (CSS). `"activity"` and `"unmount"` are defined for future optimization — plugins can opt in per-view when needed.

**Initial view types (all plugin-contributed):**
| View | Singleton | Description |
|---|---|---|
| `terminal` | No | Multiple terminal sessions |
| `editor` | Yes | File editor (manages files internally) |
| `browser` | Yes | Embedded browser |
| `review` | Yes | AI code review |

### Tab (internal)

A tab is a live instance of a view. Internal to the content panel store — plugins never import this.

```ts
// Internal to tab store
type Tab = {
  id: string; // stable nanoid
  viewId: string; // references ContentPanelView.id
  name: string; // displayed in tab bar
  state: Record<string, unknown>; // plugin-managed restorable state, persisted with tab
};
```

Components don't know about tabs. The tab system provides context with the instance id. Components access it via hooks:

```ts
// Provided by the tab system via React context
function useInstanceId(): string; // current tab's instance id
function useViewState(): Record<string, unknown>; // reactive — re-renders on state change
```

`tab.state` holds plugin-managed restorable config (e.g. terminal's `cwd`, editor's `filePath`). Plugins write via `contentPanel.updateViewState(instanceId, { cwd: "/foo" })`. The tab store persists it automatically, and cleans it up when the tab is closed. Runtime objects (xterm instances, PTY handles) live in plugin-internal variables — not in `tab.state`.

Close guards are handled via the `beforeClose` hook on `ContentPanelAPI`. Any plugin can guard any view by hooking `beforeClose` and returning `false` to cancel. The component owns its own confirmation UX.

---

## Plugin Registration

Plugins declare views statically in `configContributions()`, following the existing contribution pattern. `ContentPanelAPI` is exposed via `app.workbench.contentPanel`. UI layout regions live under `app.workbench` (contentPanel, secondarySidebar, primarySidebar, statusBar); non-UI subsystems (commands, acp, notifications) stay flat on `app`:

```ts
// Plugin only declares the view — no activate needed for basic lifecycle
const terminalPlugin: RendererPlugin = {
  name: "builtin:terminal",
  configContributions() {
    return {
      contentPanelViews: [
        {
          id: "terminal",
          name: "Terminal",
          singleton: false,
          component: () => import("./terminal-view"),
        },
      ],
    };
  },
};

// Component manages its own lifecycle (PTY spawn/kill, xterm setup)
// terminal-view.tsx
function TerminalView() {
  const instanceId = useInstanceId();
  const state = useViewState(); // { cwd: "/foo" }

  useEffect(() => {
    spawnPty(instanceId, state.cwd);
    return () => killPty(instanceId);
  }, []);
}
```

Plugins own their view's lifecycle via the component — `useEffect` for init/cleanup. Hooks (`opened`, `closed`, etc.) are for **cross-plugin** concerns (e.g. another plugin reacting to terminal open), not for the owning plugin's own initialization.

View switching (e.g. edit vs preview mode) is **not** managed by the tab system. The component handles its own internal mode state.

---

## ContentPanelAPI

The unified API for all tab operations — actions and hooks. Accessed via `app.workbench.contentPanel` from anywhere in the renderer, or triggered from the main process via oRPC.

Built on [hookable](https://github.com/unjs/hookable) (from unjs/Nuxt). Each workbench subsystem extends `Hookable` to get typed, async hooks with automatic unsubscribe.

**Why hooks instead of `store.subscribe()`?**

- **Interception:** `beforeClose` must run **before** the state change and can cancel it (return `false`). `store.subscribe()` fires **after** the state has already changed — it cannot prevent anything.
- **Async control flow:** hooks support async (e.g. awaiting a user confirmation dialog). `subscribe` callbacks cannot control async flow or return values.
- **Semantic clarity:** `hook("opened", ...)` explicitly means "when a tab opens". With `subscribe`, you'd have to diff state snapshots to infer what happened.
- **Cross-plugin communication:** one plugin hooking another plugin's view events is a natural fit for an event model, not store subscriptions.

```ts
import { Hookable } from "hookable";

interface ViewContext {
  viewId: string;
  instanceId: string;
}

interface ContentPanelHooks {
  opened: (context: ViewContext & { props: Record<string, unknown> }) => void | Promise<void>;
  closed: (context: ViewContext) => void | Promise<void>;
  activated: (context: ViewContext) => void; // tab switch within same project only
  deactivated: (context: ViewContext) => void; // tab switch within same project only
  beforeClose: (context: ViewContext) => boolean | Promise<boolean>;
}

class ContentPanel extends Hookable<ContentPanelHooks> {
  // Actions
  openView(
    viewId: string,
    options?: {
      name?: string;
      props?: Record<string, unknown>;
    },
  ): Promise<string>; // async — awaits hooks, returns instanceId

  closeView(instanceId: string): Promise<void>; // async — awaits beforeClose guard
  activateView(instanceId: string): void;
  updateView(
    instanceId: string,
    patch: {
      name?: string;
    },
  ): void;
  getViewState(instanceId: string): Record<string, unknown>;
  updateViewState(instanceId: string, patch: Record<string, unknown>): void; // shallow merge into tab.state

  // Hooks inherited from Hookable<ContentPanelHooks>:
  // hook(name, handler) — subscribe, returns unsubscribe fn
  // callHook(name, ...args) — emit
}
```

Plugin usage — `hook()` returns an unsubscribe function, pushed directly to `app.subscriptions` for automatic cleanup on deactivate. `DisposableStore` accepts both `Disposable` and `() => void`. Hooks are for **cross-plugin** concerns, not for the owning plugin's own lifecycle (which is component-driven via `useEffect`):

```ts
activate({ app }) {
  app.subscriptions.push(
    // Cross-plugin: editor guards close if unsaved
    app.workbench.contentPanel.hook("beforeClose", ({ viewId, instanceId }) => {
      if (viewId === "editor" && hasUnsavedChanges(instanceId)) return false
      return true
    }),

    // Cross-plugin: analytics on any tab open
    app.workbench.contentPanel.hook("opened", ({ viewId }) => {
      trackEvent("tab_opened", { viewId })
    }),
  )
}
```

`beforeClose` uses `callHookWith` with a custom bail caller — hookable's public API, no internal access:

```ts
// Bail on first false
async function bailCaller(hooks: HookCallback[], args: any[]): Promise<boolean> {
  for (const hook of hooks) {
    if (await hook(...args) === false) return false
  }
  return true
}

async closeView(instanceId: string) {
  const tab = this.store.getTab(instanceId)
  const context ={ viewId: tab.viewId, instanceId }
  const allowed = await this.callHookWith(bailCaller, "beforeClose", [context])
  if (allowed === false) return

  this.store.removeTab(instanceId)
  await this.callHook("closed", context)
}
```

**Singleton enforcement** lives in `openView` and is **per-project scoped**: if `ContentPanelView.singleton` is true and an instance already exists in the current project's tabs, `openView` activates it and returns the existing `instanceId` instead of creating a new one.

---

## Main Process / Agent API

Agents and main-process code trigger tab operations via oRPC. The main process handler publishes events through an oRPC subscription stream; the renderer subscribes once on app mount and dispatches to `contentPanelAPI`.

```
Agent subprocess
  → oRPC call (e.g. contentPanel.openView)
  → Main process handler → eventPublish(contentPanelEventBus, event)
  → Renderer oRPC subscription
  → app.workbench.contentPanel.openView(...)
  → Tab store updates → React re-renders
```

The renderer is the single source of truth for tab state. Both local plugin calls and agent-triggered calls funnel through the same `app.workbench.contentPanel` functions.

---

## ContentPanel Class & Store

`ContentPanel` extends `Hookable` and **owns** the store internally. The store is created in the constructor — no separate module import. All write operations go through `ContentPanel` methods (ensuring hooks fire). The store is exposed as a readonly property for React components to subscribe.

```ts
class ContentPanel extends Hookable<ContentPanelHooks> {
  readonly store: StoreApi<ContentPanelStoreState>   // exposed for React reading

  constructor(views: ContentPanelView[]) {
    super()
    this.store = createStore()(                      // zustand vanilla + immer (no persist middleware)
      immer((set, get) => ({ ... }))
    )
  }

  async hydrate(): Promise<void> { ... }             // oRPC load → setState
  async openView(viewId, options?): Promise<string>   // hooks + store write
  async closeView(instanceId): Promise<void>          // hooks + store write
  // ... other methods
}
```

```ts
type ContentPanelStoreState = {
  projects: Record<string, ProjectTabState>; // keyed by project path
};

type ProjectTabState = {
  tabs: Tab[];
  activeTabId: string | null;
};
```

**Reading (React):** `useStore(contentPanel.store, selector)` — reactive subscription via exposed store.

**Writing:** only through `ContentPanel` methods — guarantees hooks fire, no one can bypass.

The rendering layer reads `activeProject` from the project store to determine which `ProjectTabState` to show. The content panel store only owns tab data.

### Persistence

Does not use zustand `persist` middleware — it is designed for `localStorage`. Using a custom adapter adds unnecessary layers (double serialization, debounce must be hacked into the adapter, flush on close must be added manually). Manual `store.subscribe()` + debounced oRPC write is more straightforward.

**File:** `content-panel.json` in app userData directory (via `electron-store`).

**Write strategy** (inspired by VSCode):

- Zustand store updates are **in-memory immediate** (memory is the source of truth)
- `store.subscribe()` + debounce → oRPC write to main process
- **Flush on window close** — immediate flush on `beforeunload`
- Inspired by VSCode: 100ms debounced writes + 60s idle flush + blur flush + close flush (delay=0)

```ts
// persistence subscription
const debouncedSave = debounce(() => {
  rpc.contentPanel.save(store.getState().projects);
}, 100);
store.subscribe(debouncedSave);
window.addEventListener("beforeunload", () => debouncedSave.flush());
```

**Hydration timing:**

```
app.start():
  1. configContributions()           // collect views from plugins
  2. initWorkbench()                 // new ContentPanel(views), store created (empty)
  3. await contentPanel.hydrate()    // oRPC load → setState, filter invalid tabs
  4. activate()                      // plugins register hooks, store has data
  5. render()                        // UI reads hydrated state
```

```ts
// ContentPanel.hydrate()
async hydrate(): Promise<void> {
  const saved = await rpc.contentPanel.load()
  if (!saved) return
  const cleaned = this.filterInvalidTabs(saved)
  this.store.setState({ projects: cleaned })
}
```

Hydration happens before `activate()` so plugins and UI always see restored state.

**On restore:** tabs whose `viewId` is no longer registered (plugin removed) are silently skipped with a dev warning.

> **TODO:** Consolidate all UI state into a single `state.json`. Each subsystem keeps its own zustand store at runtime, but persists to the same file:
>
> ```
> Runtime (memory):                     Persistence (disk):
> ┌─────────────────────┐
> │ contentPanel.store   │─┐
> ├─────────────────────┤  │
> │ projectStore         │──┼──► state.json
> ├─────────────────────┤  │
> │ layoutStore          │─┘
> └─────────────────────┘
> ```
>
> Main process uses a single `electron-store` instance, reading/writing by namespace key:
>
> ```ts
> rpc.state.save("contentPanel", data); // → stateStore.set("contentPanel", data)
> rpc.state.load("contentPanel"); // → stateStore.get("contentPanel")
> ```
>
> Each subsystem subscribes and debounces independently. Hydration moves up to `RendererApp.start()` for a single load-and-dispatch. Currently using `electron-store`; when consolidating, consider `conf` (the underlying library, pure Node, no Electron API dependency).

---

## Plugin State Management

| State type                          | Location                             | Persisted      | Cleanup                       |
| ----------------------------------- | ------------------------------------ | -------------- | ----------------------------- |
| Tab identity + restorable config    | `tab.state` in tab store             | Yes (with tab) | Automatic on tab close        |
| Runtime objects (xterm, PTY handle) | Plugin-internal variables (Map, ref) | No             | Component `useEffect` cleanup |

Plugins do **not** need their own Zustand store for per-instance state. `tab.state` covers restorable config, and runtime objects live in plain variables inside the plugin module.

**Data flow for `openView`:**

```
await openView("terminal", { props: { cwd: "/foo" } })
  → content panel store creates Tab { id, viewId: "terminal", name: "Terminal", state: {} }
  → await callHook("opened", { viewId: "terminal", instanceId, props: { cwd: "/foo" } })
  → component mounts, calls useViewState() to read { cwd }
  → useEffect: spawn PTY, set up xterm
  → useEffect cleanup (on tab close/unmount): kill PTY
```

`openView` is **async** — it awaits hooks (serial via `callHook`). Components manage their own runtime lifecycle via `useEffect`.

**Updating tab name:** plugins call `app.workbench.contentPanel.updateView(instanceId, { name: "zsh: ~" })`.

**Data channels** (e.g. terminal stdin/stdout/resize) are the plugin's responsibility — established via oRPC or other IPC, not managed by the tab system. The tab system only handles lifecycle (open/close/activate).

**App restart / restore:** tab store hydrates from persistence → tabs exist with `state` intact. Components are **not** mounted until their project becomes active. When a restored tab becomes active, the component mounts → calls `useViewState()` for restorable config (e.g. `cwd`) → reinitializes runtime (e.g. respawn PTY). No special restore hook — `tab.state` + lazy mount is the restore mechanism.

**Singleton `openView` with existing instance:** only activates the existing tab. New props are not delivered — data updates for singleton views go through the plugin's own API (e.g. `rpc.review.showPlan()`), not through `openView`.

---

## UI Architecture

### Layout

```
┌─────────────────────────────────────────────┐
│  [Terminal ×]  [Editor ×]  [+▾]             │  ← tab bar
├─────────────────────────────────────────────┤
│                                             │
│   <ViewComponent />  (uses useViewState())   │  ← lazy loaded
│                                             │
└─────────────────────────────────────────────┘
```

### New Tab Button

The `[+]` button opens a dropdown listing all registered `contentPanelViews` (by `name`, with `icon` if provided). Clicking an item calls `openView(viewId)`. For singleton views that already have an instance, the item activates the existing tab instead.

### Rendering Strategy

Currently all views use CSS `display:none` for hiding (the default `deactivation: "hidden"`). Tabs are only mounted when their project first becomes active — this avoids bulk runtime initialization on app restart. Once mounted, they stay alive via CSS hidden.

```tsx
// mountedProjects: tracks which projects have been active this session
// A project's tabs are only rendered after it has been active at least once

{
  Object.entries(projects)
    .filter(([path]) => mountedProjects.has(path))
    .map(([projectPath, projectState]) => {
      const isActiveProject = activeProject?.path === projectPath;
      return (
        <div key={projectPath} style={{ display: isActiveProject ? "contents" : "none" }}>
          {projectState.tabs.map((tab) => {
            const isActiveTab = projectState.activeTabId === tab.id;
            return (
              <div key={tab.id} style={{ display: isActiveTab ? "contents" : "none" }}>
                <Suspense>
                  <ViewContext.Provider value={tab.id}>
                    <LazyViewComponent />
                  </ViewContext.Provider>
                </Suspense>
              </div>
            );
          })}
        </div>
      );
    });
}
```

- **Lazy project mount:** tabs are not mounted until their project becomes active — prevents bulk PTY spawn on restore
- Views are lazy-loaded via `Suspense` on first render
- Once mounted, views stay in memory (CSS hidden) until explicitly closed
- Effects (subscriptions, timers) keep running when hidden — safe for terminal PTY streams
- Future: per-view `deactivation` mode can switch individual views to `"activity"` or `"unmount"` for memory optimization

### Existing Components Used

- `components/ui/tabs.tsx` — tab bar UI (already built on `@base-ui/react/tabs`)
- `components/app-layout/panel-activity.tsx` — React 19 Activity wrapper

---

## What Is Deferred

- Tab drag-to-reorder
- Tab pinning
- Context menu on tabs (rename, duplicate)
- Split view / multiple tab groups
- Max-alive-projects LRU eviction
- View icon / badge (unread indicator)
