# Panel Maximize API Design (Plugin-facing)

**Date:** 2026-03-13
**Scope:** Renderer workbench layout API
**Status:** Approved design

## Requirement

Add a plugin-callable API to maximize panel width.

Confirmed constraints from brainstorming:

- API is exposed at `app.workbench.layout`
- Target is `contentPanel` in phase 1
- Behavior is **one-shot maximize** (not persistent mode)
- If `contentPanel` is collapsed, call is **no-op**
- Return style is `void` with no-op semantics
- No restore API in this phase

## Current Architecture Context

- Plugin entrypoint uses `PluginContext` with `ctx.app: IRendererApp`
- `IRendererApp` exposes `workbench.layout: IWorkbenchLayoutService`
- `WorkbenchLayoutService` currently provides:
  - `expandPart(part)`
  - `togglePart(part)`
- Actual panel layout state is in `components/app-layout/store.ts` (`layoutStore`)
- Width constraints and fitting are centralized in `components/app-layout/layout-coordinator.ts`

Relevant references:

- `packages/desktop/src/renderer/src/core/plugin/types.ts`
- `packages/desktop/src/renderer/src/core/types.ts`
- `packages/desktop/src/renderer/src/core/workbench/layout/types.ts`
- `packages/desktop/src/renderer/src/core/workbench/layout/service.ts`
- `packages/desktop/src/renderer/src/components/app-layout/store.ts`
- `packages/desktop/src/renderer/src/components/app-layout/layout-coordinator.ts`

## API Design

Extend `IWorkbenchLayoutService`:

```ts
export type MaximizableWorkbenchPartId = "contentPanel";

export interface IWorkbenchLayoutService {
  expandPart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
  togglePart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
  maximizePart(part: MaximizableWorkbenchPartId): void | Promise<void>;
}
```

Plugin usage:

```ts
ctx.app.workbench.layout.maximizePart("contentPanel");
```

## Behavioral Contract

For `maximizePart(part)` in phase 1 (`part` type is narrowed to `"contentPanel"`):

1. if `contentPanel` is collapsed → no-op
2. otherwise, set `contentPanel` width to the **current maximum feasible width** under existing constraints and current window width
3. no exceptions thrown for expected no-op conditions

## One-shot Maximize Semantics

This API performs a single maximize action at call time.

- It does **not** create a persistent `maximized` mode
- Later window resizes continue to follow existing layout behavior
- If window grows later, panel is not automatically re-maximized

## Computation Strategy

Use the existing layout solver instead of introducing parallel width formulas.

Algorithm in `WorkbenchLayoutService.maximizePart("contentPanel")`:

1. Read current `panels` from `layoutStore`
2. Guard no-op condition: `contentPanel` is collapsed
3. Create proposed state by setting `contentPanel` width to an extreme value
   - e.g. `setPanelWidth(panels, "contentPanel", Number.POSITIVE_INFINITY)`
4. Run existing fit solver:
   - `shrinkPanelsToFit(proposedPanels, window.innerWidth)`
5. Write resolved panels back to store once

Why this approach:

- Reuses canonical overflow/min-width policy in one place
- Avoids duplicating fragile max-width math
- Produces a feasible boundary solution with existing panel priorities

## Error Handling / No-op Policy

`maximizePart` remains intentionally simple:

- collapsed content panel: no-op
- already effectively maximized: no-op (state may remain unchanged)
- return `void`

No result object, no error codes, no thrown errors for expected no-op paths.

## Testing Design

### 1) Workbench layout service tests (required)

File: `packages/desktop/src/renderer/src/core/__tests__/workbench-layout-service.test.ts`

Add coverage for:

- `maximizePart("contentPanel")` does nothing when `contentPanel` is collapsed
- `maximizePart("contentPanel")` increases width when expanded and space allows
- repeated maximize calls are idempotent in outcome

### 2) Layout solver tests (optional but recommended)

File: `packages/desktop/src/renderer/src/components/app-layout/__tests__/layout-coordinator.test.ts`

Add a targeted test asserting that an extreme proposed width for `contentPanel` converges to a valid fitted layout under `shrinkPanelsToFit` constraints.

## Non-goals (Phase 1)

- persistent maximize mode
- restore/unmaximize API
- maximize support for all panels
- rich return types (`boolean` / result object)
- telemetry/event emission

## Future Extension Path

If needed later:

- expand `maximizePart` support beyond `contentPanel`
- introduce `restorePart` with captured previous widths
- introduce optional persistent mode with explicit mode state

This phase intentionally avoids those additions to keep behavior minimal and predictable.
