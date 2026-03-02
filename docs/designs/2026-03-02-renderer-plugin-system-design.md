# RendererApp Plugin System Design

**Goal:** Extensible plugin system for neovate-desktop's renderer where features (both built-in and future third-party) register UI contributions as plugins.

**Migrating from:** `neovateai/neovate-code-desktop` — same core pattern, with design fixes.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, Vitest, `bun`.

---

## Design Decisions

| Decision          | Choice                                            | Rationale                                                                              |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Plugin scope      | Internal-first, future third-party                | Both internal modularity and eventual external extensibility                           |
| Registry          | Static, computed at boot                          | All plugins known before React mounts. No reactivity needed. Trivial to upgrade later. |
| State access      | Services on RendererApp                           | `app.subscriptions` — one object to learn                                              |
| Contributions API | `configContributions()` function returning object | Allows conditional contributions, still collected at boot                              |
| Component props   | `useRendererApp()` hook                           | No `app` prop drilling — components access app via context                             |
| Built-in features | Plugins (e.g., `builtin:files`)                   | No hardcoded built-in vs plugin distinction in layout                                  |
| Activity bar      | `panelId` references a SecondarySidebarView       | VS Code pattern — activity bar items open sidebar panels                               |
| Lifecycle         | `configContributions` → `activate` → `deactivate` | VS Code-inspired. `activate` receives `PluginContext` for future extensibility.        |
| i18n              | Deferred                                          | Will design `configI18n` hook later                                                    |

---

## Plugin Interface

```typescript
type RendererPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<RendererPluginHooks>;

interface RendererPluginHooks {
  /** Return UI contributions — collected and merged before render */
  configContributions(): PluginContributions;

  /** Called after contributions collected, before React render.
      Initialize services, set up subscriptions. */
  activate(ctx: PluginContext): void | Promise<void>;

  /** Called on app shutdown — manual cleanup beyond subscriptions */
  deactivate(): void;
}

interface PluginContext {
  app: IRendererApp;
}

/** Plugin layer interface — RendererApp implements this */
interface IRendererApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
}
```

`PluginManager` is renderer-specific (not generic). Provides enforce ordering (`pre` → `normal` → `post`), typed hook execution, and contribution merging.

---

## Lifecycle Flow

```
1. hydrate store          — restore persisted state
2. configContributions()  — parallel, merge into Required<PluginContributions> (can read store)
3. activate({ app })      — series (enforce order), initialize services
4. React render           — mount App with contributions available via useRendererApp()
5. deactivate()           — series on shutdown, app.subscriptions auto-disposed
```

---

## PluginContributions Types

```typescript
interface PluginContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarViews?: SecondarySidebarView[];
  contentViews?: ContentPanelView[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}

interface ActivityBarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  order?: number;
  /** References a SecondarySidebarView.id */
  panelId: string;
}

interface SecondarySidebarView {
  id: string;
  title: string;
  component: () => Promise<{ default: React.ComponentType }>;
}

interface ContentPanelView {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean;
  component: () => Promise<{
    default: React.ComponentType<{ tab: PluginTab }>;
  }>;
}

interface TitlebarItem {
  id: string;
  order?: number;
  component: () => Promise<{ default: React.ComponentType }>;
}
```

The merged result from all plugins is typed as `Required<PluginContributions>` — all fields required, sorted by `order` where applicable. Computed once at boot.

---

## PluginManager

Renderer-specific. Owns plugin lifecycle and contribution merging. Not generic — `RendererPluginHooks` defined directly.

```typescript
class PluginManager {
  /** Pre-merged contributions from all plugins */
  contributions: Required<PluginContributions>;

  /** Collect and merge configContributions from all plugins (parallel) */
  async configContributions(): Promise<void>;

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void>;

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void>;
}
```

`applySeries` and `applyParallel` are private implementation details.

---

## RendererApp

Single entry point for plugins and components. Exposes `pluginManager` for contribution access.

```typescript
class RendererApp implements IRendererApp {
  readonly pluginManager: PluginManager;

  /** Global disposable store — auto-disposed on shutdown */
  readonly subscriptions: DisposableStore;

  /** Boot sequence: configContributions → activate → render */
  async start(): Promise<void>;
}

interface Disposable {
  dispose(): void;
}

class DisposableStore {
  push(...disposables: Disposable[]): void;
  dispose(): void;
}
```

React components access the same instance:

```typescript
function useRendererApp(): RendererApp;

// In any component:
function MyComponent() {
  const app = useRendererApp();
  const panels = app.pluginManager.contributions.secondarySidebarViews;
}
```

---

## Built-ins as Plugins

No hardcoded built-in vs plugin distinction. Files, Search, Git are registered as plugins:

```typescript
// plugins/files/plugin.ts
export const filesPlugin: RendererPlugin = {
  name: "builtin:files",
  configContributions() {
    return {
      activityBarItems: [
        { id: "files", icon: FolderIcon, tooltip: "Files", order: 10, panelId: "files-panel" },
      ],
      secondarySidebarViews: [
        { id: "files-panel", title: "Files", component: () => import("./FileTree") },
      ],
    };
  },
};

// main.tsx
const app = new RendererApp({
  plugins: [
    filesPlugin,
    searchPlugin,
    gitPlugin,
    // future plugins added here
  ],
});
app.start();
```

Layout components are purely data-driven:

```typescript
// ActivityBar — renders all items from contributions, no hardcoded icons
function ActivityBar() {
  const app = useRendererApp();
  return (
    <nav>
      {app.pluginManager.contributions.activityBarItems.map(item => (
        <ActivityBarButton key={item.id} {...item} />
      ))}
    </nav>
  );
}

// SecondarySidebar — renders active panel from contributions, no isBuiltinTab check
function SecondarySidebar() {
  const app = useRendererApp();
  const activeTab = useStore(s => s.secondarySidebarTab);
  const panel = app.pluginManager.contributions.secondarySidebarViews.find(p => p.id === activeTab);
  if (!panel) return null;
  const Component = lazy(panel.component);
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## Design Fixes from neovate-code-desktop

| Issue                 | Before                                                      | After                                                                |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Contribution merging  | `PluginConfigContribution[]` — layout flatMaps every render | `Required<PluginContributions>` — pre-merged, flat arrays            |
| Built-in features     | Hardcoded in layout, plugin items appended                  | Everything is a plugin (`builtin:*` naming convention)               |
| Activity bar coupling | `secondarySecondarySidebarViewId`                           | `panelId` (same concept, cleaner name)                               |
| Component props       | `{ app: RendererApp }` passed as prop                       | `useRendererApp()` hook — no prop drilling                           |
| Lifecycle             | `configI18n`, `configContributes`, `beforeRender`           | `configContributions`, `activate({ app })`, `deactivate()`           |
| Plugin context        | `{ app }` only                                              | `app.subscriptions` on the app instance                              |
| Cleanup               | No structured teardown                                      | `app.subscriptions` auto-disposed, `deactivate()` for manual cleanup |

---

## Plugin Example

```typescript
import { StickyNote } from 'lucide-react';
import type { RendererPlugin } from '../core';

export const notesPlugin: RendererPlugin = {
  name: 'notes',

  configContributions() {
    return {
      activityBarItems: [
        {
          id: 'notes',
          icon: ({ className }) => <StickyNote className={className} />,
          tooltip: 'Notes',
          order: 40,
          panelId: 'notes-panel',
        },
      ],
      secondarySidebarViews: [
        {
          id: 'notes-panel',
          title: 'Notes',
          component: () => import('./NotesSidebar'),
        },
      ],
      contentViews: [
        {
          id: 'note-editor',
          name: 'Note Editor',
          icon: ({ className }) => <StickyNote className={className} />,
          singleton: true,
          component: () => import('./NoteEditor'),
        },
      ],
    };
  },

  activate({ app }) {
    // initialize services, set up subscriptions
  },
};
```

---

## What's Deferred

- **Inter-plugin comms** — `app.commands` (CommandRegistry) and `app.events` (EventBus) added when there's a concrete need
- **i18n** — `configI18n` hook will be designed separately
- **Sub-windows** — `WindowConfig` system from neovate-code-desktop, migrate later
- **Settings UI** — plugin settings schema and auto-generated UI
- **Content panel tab management** — `app.ui.openTab()` API for programmatic tab control
