# Content Panel Tab Drag & Drop

## 1. Background

Users need to reorder tabs in the content panel by dragging. The project already uses `@dnd-kit` for project reordering in the sidebar (`project-accordion-list.tsx`). This feature mirrors that pattern for horizontal tab reordering.

## 2. Requirements Summary

**Goal:** Add horizontal drag-and-drop reordering of content panel tabs using existing `@dnd-kit` infrastructure.

**Scope:**

- In scope: Horizontal DnD within a single tab bar, DragOverlay ghost, persistence (automatic), unit tests
- Out of scope: Cross-panel dragging, tab pinning/grouping, dragging external items onto the tab bar, keyboard DnD (matches existing project pattern — project-accordion-list also uses PointerSensor only)

## 3. Acceptance Criteria

1. User can drag a tab horizontally in the tab bar to reorder it
2. Dragging shows a floating overlay ghost of the tab
3. Original tab shows 0.5 opacity while being dragged
4. 5px movement threshold prevents accidental drags from click interactions
5. Click-to-activate and close-button continue to work as before
6. New tab order persists across app restarts (automatic via existing observe/flush)
7. Orphan tabs can be reordered
8. Single tab drag is a no-op (no crash or visual glitch)
9. Unit tests cover `reorderTabs` for basic reorder and activeTabId preservation

## 4. Problem Analysis

No prior DnD exists on the tab bar. The `project-accordion-list.tsx` provides a complete vertical DnD reference pattern using `@dnd-kit/core` + `@dnd-kit/sortable`. We adapt it to horizontal.

## 5. Decision Log

**1. DnD library?**

- Options: A) @dnd-kit (already installed) · B) react-beautiful-dnd · C) Custom HTML5 drag
- Decision: **A) @dnd-kit** — already in use, proven pattern in project-accordion-list

**2. Store API shape?**

- Options: A) `reorderTabs(projectPath, tabIds: string[])` (declarative) · B) `moveTab(projectPath, fromIdx, toIdx)` (imperative)
- Decision: **A) declarative** — matches `reorderProjects(projectIds)` pattern in project store

**3. Mutation path?**

- Options: A) Through ContentPanel class method · B) Direct store call from UI
- Decision: **A) ContentPanel class** — all tab mutations go through ContentPanel (openView, closeView, activateView)

**4. Drag axis?**

- Options: A) Horizontal only · B) Free-form
- Decision: **A) Horizontal only** — tabs are in a single-row flex container, `restrictToHorizontalAxis`

**5. Sort strategy?**

- Options: A) `horizontalListSortingStrategy` · B) `rectSortingStrategy`
- Decision: **A) horizontalListSortingStrategy** — exact match for single-row layout

**6. Activation constraint?**

- Options: A) `distance: 5` · B) `delay: 250` · C) None
- Decision: **A) distance: 5** — matches project-accordion pattern, prevents click hijack

**7. Subset handling in reorderTabs?**

- Options: A) Append un-mentioned tabs at end · B) No-op if lengths differ (exact permutation required)
- Decision: **B) No-op if lengths differ** — safer for DnD-only use case, prevents accidental tab loss

**8. arrayMove utility?**

- Options: A) Use `arrayMove` from `@dnd-kit/sortable` · B) Manual splice
- Decision: **A) arrayMove** — one-liner, less error-prone than 3-line splice

## 6. Design

### Store layer

Add `reorderTabs(projectPath: string, tabIds: string[]): void` to `ContentPanelStoreState` interface and implement in `store.ts`. Safety guard: no-op if `tabIds.length !== tabs.length`. Reorders `tabs[]` to match the given ID order using a Map lookup. Preserves `activeTabId`.

### ContentPanel class

Add `reorderTabs(tabIds: string[]): void` that delegates to `this.store.getState().reorderTabs(this.projectPath, tabIds)`.

### TabBar component

Wrap with `DndContext` + `SortableContext` (horizontal strategy). Add `DragOverlay` with simplified tab ghost. Handle `onDragStart`, `onDragEnd`, `onDragCancel`. Access `contentPanel` via `useRendererApp()` to call `contentPanel.reorderTabs()` in `handleDragEnd`. Use `arrayMove` from `@dnd-kit/sortable` to compute new order. Track `activeId` state for `DragOverlay`. Access view metadata (icon, name) via `useRendererApp().pluginManager.viewContributions` and `useConfigStore` locale for the overlay ghost.

### TabItem component

Apply `useSortable` hook at the `TabItem` level, wrapping both orphan and non-orphan branches in a single `<div ref={setNodeRef} style={style} {...attributes} {...listeners}>`. This ensures orphan tabs are draggable (AC7) without duplicating sortable logic across the forked render path. Apply `transform`, `transition`, and `opacity: isDragging ? 0.5 : undefined` styles.

### Drag overlay

A simplified tab ghost: `bg-popover shadow-lg border rounded-md` with icon + name text, matching the project-accordion overlay style. Rendered inside `TabBar` component so it has access to `useRendererApp()` for view metadata resolution. `DragOverlay` portals to `document.body` by default, avoiding any scroll container issues.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/content-panel/types.ts` — add `reorderTabs` to interface
- `packages/desktop/src/renderer/src/features/content-panel/store.ts` — implement `reorderTabs`
- `packages/desktop/src/renderer/src/features/content-panel/content-panel.ts` — add `reorderTabs` method
- `packages/desktop/src/renderer/src/features/content-panel/components/tab-bar.tsx` — add DndContext, SortableContext, DragOverlay, drag handlers
- `packages/desktop/src/renderer/src/features/content-panel/components/tab-item.tsx` — add useSortable hook wrapping both branches
- `packages/desktop/src/renderer/src/features/content-panel/__tests__/content-panel.test.ts` — add reorderTabs tests via `panel.reorderTabs([...])` asserting on tab ordering and activeTabId

## 8. Verification

1. [AC1] Drag a tab left/right — it reorders
2. [AC2] While dragging, a floating ghost appears
3. [AC3] Original tab dims to 0.5 opacity
4. [AC4] Quick click on tab still activates (no accidental drag)
5. [AC5] Close button still works during non-drag interaction
6. [AC6] Reorder, restart app — order persists
7. [AC7] Orphan tab can be dragged to a new position
8. [AC8] With one tab, drag starts and ends without errors
9. [AC9] `bun test:run` passes with new reorderTabs tests
