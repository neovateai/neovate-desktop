# Content Panel Tabs Design

**Date:** 2026-03-03
**Branch:** feat/content-panel-tabs

## Overview

A multi-tab system for the content panel supporting singleton and multi-instance views, per-project persistence, and a plugin API accessible from both renderer and main process.

---

## Concepts

### View

A view is a content type registered by a plugin. It is a static declaration — defined once at startup via `configContributions()`. A view describes what can be shown in the content panel.

```ts
interface ContentPanelView {
  id: string          // "terminal", "editor", "browser", "review"
  name: string        // "Terminal", "Editor"
  singleton: boolean  // true = only one instance allowed at a time
  component: () => Promise<{ default: React.ComponentType<{ tab: ViewHandle }> }>
}
```

Views are contributed via `PluginContributions.contentPanelViews` and collected by `PluginManager` at startup.

**Initial view types (all plugin-contributed):**
| View | Singleton | Description |
|---|---|---|
| `terminal` | No | Multiple terminal sessions |
| `editor` | Yes | File editor (manages files internally) |
| `browser` | Yes | Embedded browser |
| `review` | Yes | AI plan/code review |

### Tab (internal)

A tab is a live instance of a view. It is an internal tab store concept — never exposed to plugin code directly.

```ts
// Internal to tab store — plugins never import this
type Tab = {
  id: string                        // instanceId — stable nanoid
  viewId: string                    // references ContentPanelView.id
  title: string                     // displayed in tab bar
  data: Record<string, unknown>     // per-tab config, persisted with tab
}
```

### ViewHandle

The plugin-facing interface passed to each component instance. A thin handle giving the component a communication channel back to the tab system.

```ts
interface ViewHandle {
  instanceId: string
  data: Record<string, unknown>                                // initial data from openView()
  setTitle(title: string): void                               // update tab bar title
  setData(patch: Record<string, unknown>): void               // persist state back to tab
  onBeforeClose(guard: () => boolean | Promise<boolean>): void // close confirmation
}
```

---

## Plugin Registration

Plugins declare views statically in `configContributions()`, following the existing contribution pattern:

```ts
const terminalPlugin: RendererPlugin = {
  name: "builtin:terminal",
  configContributions() {
    return {
      contentPanelViews: [{
        id: "terminal",
        name: "Terminal",
        singleton: false,
        component: () => import("./terminal-view"),
      }]
    }
  },
  activate(ctx) {
    ctx.contentPanel.onViewOpened("terminal", (instanceId, data) => {
      spawnPty(instanceId, data.cwd)
    })
    ctx.contentPanel.onViewClosed("terminal", (instanceId) => {
      killPty(instanceId)
    })
  }
}
```

View switching (e.g. edit vs preview mode) is **not** managed by the tab system. The component handles its own internal mode state.

---

## ContentPanelAPI

The unified API for all tab operations — actions and subscriptions. Accessed via `useContentPanel()` hook from anywhere in the renderer, or triggered from the main process via oRPC.

```ts
interface ContentPanelAPI {
  // Actions
  openView(viewId: string, options?: {
    title?: string
    data?: Record<string, unknown>
  }): string                                    // returns instanceId

  closeView(instanceId: string): void
  activateView(instanceId: string): void
  updateView(instanceId: string, patch: {
    title?: string
    data?: Record<string, unknown>
  }): void

  // Subscriptions
  onViewOpened(
    viewId: string,
    handler: (instanceId: string, data: Record<string, unknown>) => void
  ): Unsubscribe

  onViewClosed(viewId: string, handler: (instanceId: string) => void): Unsubscribe
  onViewActivated(viewId: string, handler: (instanceId: string) => void): Unsubscribe
  onViewDeactivated(viewId: string, handler: (instanceId: string) => void): Unsubscribe
}
```

**Singleton enforcement** lives in `openView`: if `ContentPanelView.singleton` is true and an instance already exists, `openView` activates it and returns the existing `instanceId` instead of creating a new one.

---

## Main Process / Agent API

Agents and main-process code trigger tab operations via oRPC. The main process handler publishes events through an oRPC subscription stream; the renderer subscribes once on app mount and dispatches to `contentPanelAPI`.

```
Agent subprocess
  → oRPC call (e.g. contentPanel.openView)
  → Main process handler → eventPublish(contentPanelEventBus, event)
  → Renderer oRPC subscription
  → contentPanelAPI.openView(...)
  → Tab store updates → React re-renders
```

The renderer is the single source of truth for tab state. Both local plugin calls and agent-triggered calls funnel through the same `contentPanelAPI` functions.

---

## Tab Store

Zustand store with Immer, persisted per project (cwd) using an async electron-store adapter via oRPC.

```ts
type TabStore = {
  projects: Record<string, ProjectTabState>   // keyed by cwd
  activeCwd: string | null
}

type ProjectTabState = {
  tabs: Tab[]
  activeTabId: string | null
}
```

**Persistence adapter:**
```ts
const electronStorage: StateStorage = {
  getItem: (name) => orpc.store.get.call({ name }),
  setItem: (name, value) => orpc.store.set.call({ name, value }),
  removeItem: (name) => orpc.store.remove.call({ name }),
}

persist(immer(...), {
  name: `tabs:${cwd}`,
  storage: electronStorage,   // async — Zustand persist supports this
})
```

**On restore:** tabs whose `viewId` is no longer registered (plugin removed) are silently skipped with a dev warning.

---

## Plugin State Management

The tab store owns only tab identity and config. Plugins own their runtime state.

| State type | Location |
|---|---|
| Tab identity / initial config | `tab.data` (persisted by tab store) |
| Per-tab UI state to restore | `tab.data` via `ViewHandle.setData()` |
| Runtime state (buffers, process handles) | Plugin's own Zustand store, keyed by `instanceId` |
| Global plugin state to restore | Plugin's own persisted Zustand store |

Long-running processes (e.g. terminal PTY) must live in the main process or a store — not in component `useEffect`. React 19's `<Activity mode="hidden">` tears down effects when a tab is hidden, so process state must survive outside the component tree.

---

## UI Architecture

### Layout

```
┌─────────────────────────────────────────────┐
│  [Terminal ×]  [Editor ×]  [+]              │  ← tab bar
├─────────────────────────────────────────────┤
│                                             │
│   <ActiveViewComponent tab={viewHandle} />  │  ← lazy loaded
│                                             │
└─────────────────────────────────────────────┘
```

### Rendering Strategy

All views across all projects are mounted once activated and kept alive via nested React 19 `<Activity>`. Switching projects or tabs never unmounts — it only hides.

```tsx
// Outer: per project
{Object.entries(projects).map(([cwd, projectState]) => (
  <Activity key={cwd} mode={activeCwd === cwd ? "visible" : "hidden"}>
    // Inner: per tab
    {projectState.tabs.map(tab => (
      <Activity key={tab.id} mode={projectState.activeTabId === tab.id ? "visible" : "hidden"}>
        <Suspense>
          <LazyViewComponent tab={viewHandle(tab)} />
        </Suspense>
      </Activity>
    ))}
  </Activity>
))}
```

- Views are lazy-loaded via `Suspense` on first activation
- Once mounted, views stay in memory until explicitly closed
- Long-running processes (terminal output) continue receiving data regardless of visibility — they are buffered in plugin stores, not in component state

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
