# Renderer Layout Migration Design

Migrate the renderer layout from neovate-code-desktop to neovate-desktop, built from scratch using neovate-desktop's own patterns and conventions.

## Layout Structure

```
+----------+----------------+------------+------+---------+
| Traffic  | PrimaryTitleBar| SecondaryTitleBar            |
+----------+----------------+------------+------+---------+
| Primary  |                | Content    | Sec. | Activity|
| Sidebar  |  Chat Panel    | Panel      | Side |  Bar    |
| (300px)  |  (flex-1)      | (300px)    |(240px)| (48px) |
|          |  AgentChat     | placeholder| plch |         |
+----------+----------------+------------+------+---------+
|                     Status Bar                           |
+----------------------------------------------------------+
```

- All panel widths are fixed CSS values (no resize handlers)
- Panels can be toggled visible/hidden via activity bar
- `motion` library for smooth show/hide spring animations
- No plugin extension points
- AgentChat component stays as-is in the chat panel
- All other panels get placeholder content

## State Design

Layout state manages panel visibility only. Designed to be extensible for future tabs, resize, and persistence without refactoring.

```typescript
// Phase 1 (now)
type PanelState = {
  collapsed: boolean;
};

// Phase 2 (future: tabs)
// Add: activeTabId?: string, tabs?: Array<{ id: string; label: string }>

// Phase 3 (future: resize + persist)
// Add: width?: number, wrap with Zustand persist middleware

// Root shape (stable across all phases)
type LayoutState = {
  panels: Record<string, PanelState>;
};

type LayoutActions = {
  togglePanel: (id: string) => void;
  isPanelOpen: (id: string) => boolean;
};
```

Key decisions:

- `Record<string, PanelState>` is open-ended: new panels = new string IDs, no type changes
- Tab selection is per-panel local state, not in layout state (avoids coupling)
- The whole tree serializes as one JSON blob for future persistence
- Zustand store from the start (already a dependency) — persistence-ready via `persist` middleware when needed
- No React context provider needed — Zustand stores are consumed directly via hooks

## Component Architecture

New files in `src/renderer/src/components/layout/`:

| File                     | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `app-layout.tsx`         | Root layout container + panel sub-components  |
| `use-layout-store.ts`    | Zustand store for panel visibility state      |
| `activity-bar.tsx`       | Right icon bar with panel toggle buttons      |
| `primary-titlebar.tsx`   | Left title bar (app name, drag region)        |
| `secondary-titlebar.tsx` | Right title bar (settings, drag region)       |
| `traffic-lights.tsx`     | macOS window controls spacer + sidebar toggle |
| `status-bar.tsx`         | Bottom status bar                             |
| `index.ts`               | Barrel exports                                |

## Animation & Styling

- `motion` library (new dependency) for panel width animation (slide in/out)
- React 19.2 `<Activity>` component wraps panel content — cleans up effects when hidden, restores when visible
- Combined: `motion` handles visual animation, `<Activity>` handles state/effects lifecycle
- Spring-based animation (critically damped: stiffness ~600, damping ~49)
- All Tailwind utility classes, CSS variables from existing `globals.css`
- Panel backgrounds use `card`/`card-foreground` theme tokens
- Fixed widths: `w-[300px]` (primary sidebar), `w-[240px]` (secondary sidebar), `w-12` (activity bar)
- macOS traffic lights: spacer div with fixed width

## Integration

### Modified files

- `App.tsx` — replace simple layout with new layout components; AgentChat slots into chat panel
- `package.json` — add `motion` dependency

### Unchanged

- AgentChat component (re-parented only)
- All existing UI components in `components/ui/`
- Main process, preload, IPC layer
- CSS globals

## Panel Placeholders

- **Primary sidebar**: "Sessions" header + empty list message
- **Content panel**: "Content" header + centered placeholder text
- **Secondary sidebar**: "Files" header + centered placeholder text
- **Activity bar**: icon buttons (Files, Search, Git toggles)
- **Status bar**: simple bottom bar with muted text
