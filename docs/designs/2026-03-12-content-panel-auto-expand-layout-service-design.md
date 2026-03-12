# Content Panel Auto-Expand via Workbench Layout Service

**Date:** 2026-03-12
**Issue:** #102
**Branch:** issue-102-auto-expand-content-panel

## Requirement

When renderer code opens a content panel view through `app.workbench.contentPanel.openView(...)`, the content panel should automatically expand if it is currently collapsed.

This behavior should be consistent for all callers. Opening a content panel view should not require each feature to remember to manually reveal the panel first.

## Current Problems

Today the behavior is inconsistent:

- some features import `layoutStore` and expand `contentPanel` before calling `openView(...)`
- other callers invoke `openView(...)` directly and do not reveal the panel
- `layoutStore` has started leaking as a shared implementation dependency across the renderer

This creates two separate problems:

1. Issue `#102`: opening a content panel view does not always reveal the panel
2. Architectural drift: features and plugins are learning `layoutStore` internals instead of using a stable workbench API

## Design Principles

### One public behavior entry point

If opening a content panel view should reveal the panel, that rule belongs at the `contentPanel.openView(...)` boundary, not in each caller.

### Shell behavior belongs to layout

Showing, hiding, sizing, and arranging workbench parts are layout concerns. They should live behind a layout subsystem API.

### Content behavior belongs to contentPanel

Tab creation, singleton reuse, activation, persistence, and view state are content panel concerns. They should remain inside `ContentPanel`.

### Workbench subsystems should depend on stable APIs, not raw stores

The renderer can keep Zustand, but Zustand should be an internal state mechanism. It should not be the public integration surface for unrelated features.

### Prefer plain DI over framework-heavy infrastructure

This design does not require decorators or a VS Code-style service registry. Plain constructor injection at the workbench composition root is enough.

## Proposed Design

Introduce a formal `IWorkbenchLayoutService` under `app.workbench.layout` and make `ContentPanel` depend on that service directly.

The public workbench shape becomes:

```ts
app.workbench.layout;
app.workbench.contentPanel;
```

These remain siblings.

`layout` is a cross-cutting workbench service. It manages shared shell concerns for named workbench parts.

`contentPanel` is a workbench subsystem with its own domain behavior:

- `openView`
- `closeView`
- `activateView`
- singleton reuse
- tab persistence

`contentPanel` is not just a layout region, so it should not be nested under `layout`. At the same time, visibility is not a content concern, so `layout` should not be nested under `contentPanel`.

## How This Solves the Requirement

`ContentPanel.openView(...)` will call:

```ts
layout.expandPart("contentPanel");
```

before running the existing tab-opening logic.

That means:

- opening a new content tab reveals the panel
- reusing an existing singleton tab also reveals the panel
- callers no longer need to import `layoutStore` or duplicate reveal logic

## Workbench Layout Service Design

### Responsibilities

`IWorkbenchLayoutService` owns shared workbench shell behavior for named workbench parts.

The important distinction is:

- not every workbench part supports the same behavior
- this issue only needs shared behavior for collapsible parts

Its responsibilities include:

- expanding parts that support collapsed state
- later, if needed, other genuinely shared shell behavior

`IWorkbenchLayoutService` should not absorb part-specific behavior. For example, choosing the active view inside `secondarySidebar` is not a layout concern and should not be added to `IWorkbenchLayoutService`.

### API

```ts
export const WORKBENCH_PART = {
  primarySidebar: "primarySidebar",
  chatPanel: "chatPanel",
  contentPanel: "contentPanel",
  secondarySidebar: "secondarySidebar",
} as const;

export type WorkbenchPartId = (typeof WORKBENCH_PART)[keyof typeof WORKBENCH_PART];

export const COLLAPSIBLE_WORKBENCH_PART = {
  primarySidebar: WORKBENCH_PART.primarySidebar,
  contentPanel: WORKBENCH_PART.contentPanel,
  secondarySidebar: WORKBENCH_PART.secondarySidebar,
} as const;

export type CollapsibleWorkbenchPartId =
  (typeof COLLAPSIBLE_WORKBENCH_PART)[keyof typeof COLLAPSIBLE_WORKBENCH_PART];

export interface IWorkbenchLayoutService {
  expandPart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
  togglePart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
}
```

This is intentionally small. It only exposes behavior that is genuinely shared by collapsible workbench parts.

The `core/workbench/layout` package should define these canonical ids itself. It should not depend on `components/app-layout/types.ts`.

## ContentPanel Design

`ContentPanel` should depend directly on `IWorkbenchLayoutService`.

```ts
class ContentPanel {
  constructor(private readonly layout: IWorkbenchLayoutService) {}

  openView(viewType: string, options?: { name?: string; activate?: boolean }): string {
    this.layout.expandPart("contentPanel");
    // existing open logic
    return "id";
  }
}
```

This is preferred over a custom `ContentPanelHost` because:

- `ContentPanel` is already a workbench-internal subsystem
- `IWorkbenchLayoutService` is a natural dependency in this environment
- testing remains easy with constructor injection
- a host wrapper would mostly rename the same dependency without enough benefit

`ContentPanel` should not also expose `expand()` or `collapse()` at this stage. Those are layout operations. The only reason `ContentPanel` touches layout here is because `openView()` semantically requires its host region to be usable.

## Service State and Reactivity

### Are services allowed to be stateful?

Yes.

`IWorkbenchLayoutService` should be stateful. Layout is inherently stateful because it owns:

- collapsed state
- widths
- resize lifecycle
- active sidebar view

### Can a service hold a Zustand store?

Yes. That is the recommended design here.

The correct boundary is:

- `IWorkbenchLayoutService` owns Zustand internally
- React reads layout state through the layout subsystem
- writes go through `IWorkbenchLayoutService`
- unrelated features do not import the raw layout store

At this stage, the design does **not** define a stable `LayoutState` type in `core`.

That is deliberate.

For this issue, the important contract is:

- canonical workbench part ids
- the collapsible subset
- the `IWorkbenchLayoutService` behavior surface

The exact state shape exposed to React can be finalized later.

The current transition does not need to move store ownership yet.

For now:

- `WorkbenchLayoutService` is a thin adapter over the existing `app-layout` store
- `app-layout` UI can keep using the current store directly
- store ownership can move later without changing the `IWorkbenchLayoutService` contract

Recommended implementation shape:

```ts
class WorkbenchLayoutService implements IWorkbenchLayoutService {
  constructor(private readonly adapter: LayoutAdapter) {}

  expandPart(part: CollapsibleWorkbenchPartId) {
    if (this.adapter.isExpanded(part)) return;
    return this.adapter.togglePart(part);
  }

  togglePart(part: CollapsibleWorkbenchPartId) {
    return this.adapter.togglePart(part);
  }
}
```

This design matches the current implementation reality:

- the underlying app-layout store is still toggle-based
- callers currently need explicit expand semantics
- `IWorkbenchLayoutService` provides that explicit behavior without leaking raw toggle logic to unrelated modules

How React subscribes to layout state remains an implementation detail for now. The important decision is that unrelated features should stop importing `layoutStore` directly.

## Shared vs Specific Behavior

`IWorkbenchLayoutService` should only contain shared behavior.

Examples of valid shared behavior:

- `expandPart("contentPanel")`
- `togglePart("primarySidebar")`

Examples of behavior that should stay outside `IWorkbenchLayoutService`:

- `contentPanel.openView(...)`
- `secondarySidebar.setActiveView(...)`
- `statusBar.showItem(...)`

Part-specific behavior belongs to the corresponding subsystem, even if it internally uses `IWorkbenchLayoutService`.

## React UI Usage

Layout UI is allowed to depend on the layout subsystem. That is not a layering violation because the layout UI is part of the same subsystem boundary.

The exact read API for React is intentionally left open in this document. That can be decided when implementing the adapter layer.

What is already decided:

- layout UI may read layout state through the layout subsystem boundary
- unrelated features should not write through raw store actions

## ContentPanel and Layout Boundary

`ContentPanel` is allowed to depend on `IWorkbenchLayoutService`, but only for behavior that is semantically required by content operations.

For this issue, that means:

- `openView()` expands `contentPanel`

It does not mean:

- `ContentPanel` owns expand/collapse as a first-class public API
- `ContentPanel` becomes a proxy for arbitrary layout operations

This keeps the dependency honest without turning `ContentPanel` into a layout facade.

## Initialization

Initialize the layout service and content panel together in the workbench composition root.

```ts
function createWorkbench(): IWorkbench {
  const layout = new WorkbenchLayoutService();
  const contentPanel = new ContentPanel(layout);

  return {
    layout,
    contentPanel,
  };
}
```

This is standard DI:

- the dependency is created outside the consumer
- the dependency is passed in explicitly
- tests can provide a fake service

No decorators are needed.
No service registry is needed for this step.

## File Structure

Recommended structure:

```text
src/renderer/src/
  core/
    workbench/
      layout/
        service.ts
        types.ts
        index.ts
  components/
    app-layout/
      store.ts
      hooks.ts
      ...
```

Responsibilities:

- `core/workbench/layout/*` defines the public layout subsystem
- `components/app-layout/store.ts` remains the current low-level state implementation
- `RendererApp` or a new `createWorkbench()` assembles and exposes `app.workbench.layout`

The store can move later if needed. That is not required to establish the boundary now.

## Migration Plan

1. Introduce `app.workbench.layout`
2. Move `ContentPanel` to depend on `IWorkbenchLayoutService`
3. Update `ContentPanel.openView(...)` to call `layout.expandPart("contentPanel")`
4. Remove duplicated reveal logic from file/search/git callers
5. Stop adding new direct imports of `layoutStore`
6. Gradually migrate existing direct imports behind `IWorkbenchLayoutService`

## Testing

### ContentPanel

Add tests that verify:

- `openView()` calls `layout.expandPart("contentPanel")`
- singleton reuse still calls `expandPart`
- `activate: false` still only affects activation behavior

Example:

```ts
it("reveals contentPanel before opening", () => {
  const layout: IWorkbenchLayoutService = {
    expandPart: vi.fn(),
    togglePart: vi.fn(),
  };

  const panel = new ContentPanel(layout);
  panel.openView("editor");

  expect(layout.expandPart).toHaveBeenCalledWith("contentPanel");
});
```

### Layout

Keep layout state and UI tests focused on the layout subsystem itself:

- `expandPart()` expands a collapsed part
- React layout selectors still render correctly

## Risks

- `ensureVisible()` is currently expected to be synchronous; if that changes, `openView()` may need to become async
- migration will be incremental, so there may be a temporary period where both `IWorkbenchLayoutService` and direct `layoutStore` imports coexist
- if `IWorkbenchLayoutService` grows without discipline, it could become a dumping ground for unrelated UI behavior
- if too many part-specific behaviors get forced into `IWorkbenchLayoutService`, the abstraction will lose clarity

## Non-Goals

- rewriting every renderer subsystem into a service immediately
- removing Zustand
- building a full VS Code-style DI and service registry system
- making services stateless
- redesigning `activateView()` semantics in this issue

## Final Recommendation

- Solve issue `#102` by making `ContentPanel.openView(...)` reveal the panel through `IWorkbenchLayoutService`
- Formalize `app.workbench.layout` as the public layout subsystem
- Keep `layout` and `contentPanel` as sibling workbench APIs
- Keep `IWorkbenchLayoutService` limited to genuinely shared collapsible-part behavior
- Keep Zustand inside the layout service boundary
- Keep the exact React read adapter open for later implementation
- Use plain DI at workbench initialization
