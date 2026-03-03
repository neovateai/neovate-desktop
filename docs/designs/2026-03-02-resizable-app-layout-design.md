# Resizable App Layout Design

Migrate resizable panel system from neovate-code-desktop, rewritten with composable behaviors and Zustand persistence.

## What Changes

- Panels get draggable resize handles (primary sidebar, content panel, secondary sidebar)
- Panel widths persist across sessions via Zustand persist middleware
- Window auto-resizes when toggling panels that exceed available space
- Layout math is rewritten as composable behaviors instead of code-desktop's 21+ bespoke functions

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ renderer/components/app-layout/                         │
│                                                         │
│  constants.ts        APP_LAYOUT_* dimensions + grid     │
│  types.ts            PanelDescriptor, PanelMap, behav.  │
│  behaviors.ts        Composable resize/open/overflow    │
│  panel-descriptors   Panel definitions using behaviors  │
│  layout-coordinator  Constraint solving, overflow, fit  │
│  store.ts            Zustand store + persist middleware  │
│  hooks.ts            Composed hooks for resize logic    │
│  resize-handle       Handle component + gradient viz    │
│  app-layout          Root grid layout + panel shells    │
│  primary-sidebar     Uses usePanelState hook            │
│  content-panel       Uses usePanelState hook            │
│  secondary-sidebar   Uses usePanelState hook            │
│  activity-bar        Plugin-contributed sidebar views   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Main Process (oRPC)                                     │
│                                                         │
│  window.ensureWidth  Auto-expand window when needed     │
└─────────────────────────────────────────────────────────┘
```

## Layout Structure

The root layout uses CSS Grid with named areas. All panels are flat siblings — no wrapper divs.

```
AppLayoutRoot (CSS Grid)
  gridTemplateAreas:
    "primarySidebar  primarySidebar_chatPanel  titleBar  titleBar  titleBar  titleBar  titleBar  titleBar"
    "primarySidebar  primarySidebar_chatPanel  chatPanel  chatPanel_contentPanel  contentPanel  contentPanel_secondarySidebar  secondarySidebar  activityBar"
  gridTemplateColumns: auto auto 1fr auto auto auto auto auto
  gridTemplateRows: auto 1fr

├── TrafficLights (fixed positioned)
├── PrimarySidebar           → gridArea: primarySidebar (spans both rows)
├── ResizeHandle             → gridArea: primarySidebar_chatPanel (spans both rows)
├── TitleBar                 → gridArea: titleBar (spans row 1, cols 3-8)
├── ChatPanel                → gridArea: chatPanel (1fr, fills remaining)
├── ResizeHandle             → gridArea: chatPanel_contentPanel
├── ContentPanel             → gridArea: contentPanel
├── ResizeHandle             → gridArea: contentPanel_secondarySidebar
├── SecondarySidebar         → gridArea: secondarySidebar
├── ActivityBar              → gridArea: activityBar
```

Grid areas are defined in `APP_LAYOUT_GRID_AREA` (keyed by `PanelId | SeparatorId | "titleBar" | "activityBar"`), and the grid template in `APP_LAYOUT_GRID`. Both live in `constants.ts`.

Each panel still owns its width via framer-motion `animate={{ width }}`. Grid columns use `auto` sizing, so they track the animated panel width. The `1fr` column (chatPanel) fills remaining space. When resize handles return `null` (collapsed neighbor), the grid area column collapses to 0 width.

## State Design

Extend existing Zustand store from `{ collapsed }` to `{ width, collapsed }` with persist middleware.

```typescript
type PanelState = {
  width: number;
  collapsed: boolean;
  activeView?: string;
};

type LayoutStore = {
  panels: Record<PanelId, PanelState>;
  resizing: PanelId | null; // transient, not persisted
  togglePanel: (id: PanelId) => void;
  setWidth: (id: PanelId, width: number) => void;
  startResize: (id: PanelId) => void;
  stopResize: () => void;
  setSecondarySidebarActiveView: (viewId: string) => void;
  shrinkPanelsToFit: () => void;
};

const DEFAULT_PANELS = {
  primarySidebar: { width: 300, collapsed: false },
  contentPanel: { width: 300, collapsed: true },
  secondarySidebar: { width: 240, collapsed: true, activeView: "git" },
};
```

Persistence via Zustand `persist` middleware with `localStorage`. `partialize` excludes `resizing` and actions from storage. Merge function validates stored widths against min/max on load.

## Composable Behaviors

Each panel's behavior is composed from reusable building blocks rather than bespoke functions.

### Behavior Interfaces

```typescript
type ResizeBehavior = (clientX: number, ctx: LayoutContext) => number;
type OpenBehavior = (storedWidth: number, ctx: LayoutContext) => number;
type OverflowBehavior = { priority: number };
```

### Behavior Factories

```typescript
resize.fromLeftEdge(offset); // width = clientX - offset
resize.fromRightOf(getRightBoundary); // width = rightBoundary - clientX
resize.fromRightEdge(getRightOffset); // width = windowWidth - clientX - offset

open.restore(); // reopen at stored width
open.splitWith(defaultWidth, ratio); // first open: split available space; re-open: restore

overflow.shrinkable(priority); // willing to shrink, higher priority = shrink first
```

### Panel Descriptors

```typescript
const PANEL_DESCRIPTORS: PanelDescriptor[] = [
  {
    id: "primarySidebar",
    min: 250,
    max: 600,
    defaultWidth: 300,
    defaultCollapsed: false,
    resize: resize.fromLeftEdge(APP_LAYOUT_EDGE_SPACING),
    open: open.restore(),
    overflow: overflow.shrinkable(0),
  },
  {
    id: "contentPanel",
    min: 300,
    max: Infinity,
    defaultWidth: 300,
    defaultCollapsed: true,
    resize: resize.fromRightOf(/* secondary sidebar boundary */),
    open: open.splitWith(300, 0.5),
    overflow: overflow.shrinkable(2),
  },
  {
    id: "secondarySidebar",
    min: 240,
    max: 600,
    defaultWidth: 240,
    defaultCollapsed: true,
    resize: resize.fromRightEdge(() => APP_LAYOUT_ACTIVITY_BAR_WIDTH),
    open: open.restore(),
    overflow: overflow.shrinkable(1),
  },
];
```

## Layout Coordinator

Pure functions for cross-panel coordination:

- `constrainWidth(desc, width, ctx)` — apply min/max/dynamicMax to any panel
- `computeMaxAvailableWidth(desc, ctx)` — available space for a panel based on sibling state
- `computeTotalWidth(panels, descriptors)` — total width consumed by fixed elements and expanded panels
- `shrinkPanelsToFit(panels, windowWidth, descriptors)` — shrink panels by overflow priority until layout fits
- `computeMinWindowWidth(panels, descriptors)` — total minimum width for window auto-resize IPC
- `openPanel(panels, id, windowWidth)` — expand a panel with open behavior, clamping, and fit
- `collapsePanel(panels, id)` — collapse a panel

No per-panel hardcoded logic. Works with any set of PanelDescriptors.

## Drag Event Handling

### Approach: Attach-During-Drag with Guards

- **PointerEvent** (not MouseEvent) for unified mouse/touch/pen input
- Global `pointermove`/`pointerup` listeners attached to `document` only while `resizing !== null`
- Removed on `pointerup` or component unmount
- No always-on listeners that could interfere with other interactions

### Conflict Prevention

- `event.defaultPrevented` guard on all handlers
- Primary button filter (`event.button === 0`)
- `preventDefault()` on `pointerdown` to prevent text selection

### Implementation

`usePanelResize()` hook composed from three focused hooks:

- `useEnsureWindowMin()` — syncs OS minimum window width on panel changes (filtered by reference equality)
- `useFitOnResize()` — fits panels on mount and rAF-throttled window resize
- `usePanelDrag()` — pointer event handling during active resize

## Resize Handle Component

`resize-handle.tsx` with extracted `getGradientStyle()` helper:

- Returns `null` when adjacent panel is collapsed
- 5px wide, radial gradient indicator following mouse Y position
- Expanded hit area via `absolute inset-y-0 -inset-x-1`
- Opacity: 50% on hover, 100% during active drag

## Window Auto-Resize

OS minimum window width synced via `window.ensureWidth` oRPC procedure whenever panels change. The `mainWindow` is typed as `BrowserWindow | null` with an early return guard.

## Constants

```typescript
/** Minimum width of the chat panel (always visible) */
export const APP_LAYOUT_CHAT_PANEL_MIN_WIDTH = 320;
/** Width of the activity bar on the right edge */
export const APP_LAYOUT_ACTIVITY_BAR_WIDTH = 40;
/** Spacing between the window edge and the primary sidebar */
export const APP_LAYOUT_EDGE_SPACING = 8;
/** Width of the draggable resize handles between panels */
export const APP_LAYOUT_RESIZE_HANDLE_WIDTH = 5;
/** Left margin for the titlebar when the primary sidebar is collapsed */
export const APP_LAYOUT_COLLAPSED_TITLEBAR_LEFT_MARGIN = 136;

/** Grid area names keyed by PanelId | SeparatorId | "titleBar" | "activityBar" */
export const APP_LAYOUT_GRID_AREA = { ... };
/** CSS Grid template (gridTemplateAreas, gridTemplateColumns, gridTemplateRows) */
export const APP_LAYOUT_GRID = { ... };
```

## Testing

- Layout coordinator: unit tests for constrainWidth, computeMaxAvailableWidth, shrinkPanelsToFit, computeMinWindowWidth, countVisibleHandles
- Behaviors: unit tests for each factory (resize.fromLeftEdge, open.splitWith, overflow.shrinkable)
- Integration: end-to-end scenarios (drag, fit-to-window with priority shrinking, min width computation)
- Window router: ensureWidth handler tests with mock BrowserWindow
