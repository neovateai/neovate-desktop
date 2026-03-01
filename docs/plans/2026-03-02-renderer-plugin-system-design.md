# RendererApp Plugin System Design

**Goal:** Extensible plugin system for neovate-desktop's renderer where features (both built-in and future third-party) register UI contributions, commands, and event listeners as plugins.

**Migrating from:** `neovateai/neovate-code-desktop` — same core pattern, with design fixes.

**Tech Stack:** React 19, TypeScript 5, Zustand 5, Vitest, `bun`.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Plugin scope | Internal-first, future third-party | Both internal modularity and eventual external extensibility |
| Registry | Static, frozen at boot | All plugins known before React mounts. No reactivity needed. Trivial to upgrade later. |
| State access | Services on RendererApp | `app.commands`, `app.events`, `app.subscriptions` — one object to learn |
| Inter-plugin comms | Event bus on app | `app.events.on()` / `app.events.emit()` — loose coupling |
| Contributions API | `configContributions()` function returning object | Allows conditional contributions, still collected at boot |
| Component props | `useRendererApp()` hook | No `app` prop drilling — components access app via context |
| Built-in features | Plugins (e.g., `builtin:files`) | No hardcoded built-in vs plugin distinction in layout |
| Activity bar | `panelId` references a SidebarPanel | VS Code pattern — activity bar items open sidebar panels |
| Lifecycle | `configContributions` → `activate` → `deactivate` | VS Code-inspired. `activate` receives `PluginContext` for future extensibility. |
| i18n | Deferred | Will design `configI18n` hook later |

---

## Plugin Interface

```typescript
type RendererPlugin = {
  name: string;
  enforce?: 'pre' | 'post';
} & Partial<RendererPluginHooks>;

interface RendererPluginHooks {
  /** Return UI contributions — collected and merged before render */
  configContributions(): PluginContributions;

  /** Called after contributions collected, before React render.
      Register commands, event listeners, initialize services. */
  activate(ctx: PluginContext): void | Promise<void>;

  /** Called on app shutdown — manual cleanup beyond subscriptions */
  deactivate(): void;
}

interface PluginContext {
  app: RendererApp;
  // Extensible — add fields here as needed (logger, config, etc.)
}
```

`PluginManager` from neovate-code-desktop is reused unchanged — provides enforce ordering (`pre` → `normal` → `post`) and typed hook execution (`applyParallel`, `applySeries`, etc.).

---

## Lifecycle Flow

```
1. configContributions()  — parallel, merge into frozen CollectedContributions
2. hydrate store          — restore persisted state
3. activate({ app })      — series (enforce order), register commands/events
4. React render           — mount App with contributions available via useRendererApp()
5. deactivate()           — series on shutdown, app.subscriptions auto-disposed
```

---

## PluginContributions Types

```typescript
interface PluginContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarPanels?: SidebarPanel[];
  contentPanels?: ContentPanel[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}

interface ActivityBarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  order?: number;
  /** References a SidebarPanel.id */
  panelId: string;
}

interface SidebarPanel {
  id: string;
  title: string;
  component: () => Promise<{ default: React.ComponentType }>;
}

interface ContentPanel {
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

### CollectedContributions

Pre-merged from all plugins, frozen, computed once at boot. Layout components read flat arrays directly.

```typescript
interface CollectedContributions {
  activityBarItems: ActivityBarItem[];          // sorted by order
  secondarySidebarPanels: SidebarPanel[];
  contentPanels: ContentPanel[];
  primaryTitlebarItems: TitlebarItem[];         // sorted by order
  secondaryTitlebarItems: TitlebarItem[];       // sorted by order
}
```

---

## RendererApp

Single entry point for plugins and components. Owns contributions, commands, events, subscriptions.

```typescript
class RendererApp {
  /** Frozen, pre-merged contributions from all plugins */
  readonly contributions: CollectedContributions;

  /** Command registry — register and execute named commands */
  readonly commands: CommandRegistry;

  /** Event bus — inter-plugin and plugin-to-UI communication */
  readonly events: EventBus;

  /** Global disposable store — auto-disposed on shutdown */
  readonly subscriptions: DisposableStore;

  /** Zustand store access */
  readonly useStore: typeof useStore;

  /** Start the app — collect, activate, render */
  async start(): Promise<void>;
}

interface CommandRegistry {
  register(id: string, handler: (...args: unknown[]) => unknown): Disposable;
  execute<T = unknown>(id: string, ...args: unknown[]): T;
}

interface EventBus {
  on<T = unknown>(event: string, handler: (data: T) => void): Disposable;
  emit(event: string, data?: unknown): void;
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
  const panels = app.contributions.secondarySidebarPanels;
  app.commands.execute('files.refresh');
}
```

---

## Built-ins as Plugins

No hardcoded built-in vs plugin distinction. Files, Search, Git are registered as plugins:

```typescript
// plugins/files/plugin.ts
export const filesPlugin: RendererPlugin = {
  name: 'builtin:files',
  configContributions() {
    return {
      activityBarItems: [
        { id: 'files', icon: FolderIcon, tooltip: 'Files', order: 10, panelId: 'files-panel' },
      ],
      secondarySidebarPanels: [
        { id: 'files-panel', title: 'Files', component: () => import('./FileTree') },
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
      {app.contributions.activityBarItems.map(item => (
        <ActivityBarButton key={item.id} {...item} />
      ))}
    </nav>
  );
}

// SecondarySidebar — renders active panel from contributions, no isBuiltinTab check
function SecondarySidebar() {
  const app = useRendererApp();
  const activeTab = useStore(s => s.secondarySidebarTab);
  const panel = app.contributions.secondarySidebarPanels.find(p => p.id === activeTab);
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

| Issue | Before | After |
|---|---|---|
| Contribution merging | `PluginConfigContribution[]` — layout flatMaps every render | `CollectedContributions` — pre-merged, frozen, flat arrays |
| Built-in features | Hardcoded in layout, plugin items appended | Everything is a plugin (`builtin:*` naming convention) |
| Activity bar coupling | `secondarySidebarPanelId` | `panelId` (same concept, cleaner name) |
| Component props | `{ app: RendererApp }` passed as prop | `useRendererApp()` hook — no prop drilling |
| Lifecycle | `configI18n`, `configContributes`, `beforeRender` | `configContributions`, `activate({ app })`, `deactivate()` |
| Plugin context | `{ app }` only | `app.commands`, `app.events`, `app.subscriptions` on the app instance |
| Inter-plugin comms | None | Event bus + command registry |
| Cleanup | No structured teardown | `app.subscriptions` auto-disposed, `deactivate()` for manual cleanup |

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
      secondarySidebarPanels: [
        {
          id: 'notes-panel',
          title: 'Notes',
          component: () => import('./NotesSidebar'),
        },
      ],
      contentPanels: [
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
    app.subscriptions.push(
      app.commands.register('notes.create', () => {
        // open a new note in content panel
      })
    );

    app.subscriptions.push(
      app.events.on('workspace.changed', () => {
        // refresh notes list
      })
    );
  },
};
```

---

## What's Deferred

- **i18n** — `configI18n` hook will be designed separately
- **Sub-windows** — `WindowConfig` system from neovate-code-desktop, migrate later
- **Settings UI** — plugin settings schema and auto-generated UI
- **Content panel tab management** — `app.ui.openTab()` API for programmatic tab control
