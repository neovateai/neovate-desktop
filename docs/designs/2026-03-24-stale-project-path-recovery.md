# Stale Project Path Recovery

## 1. Background

GitHub issue #286. When a remembered project path no longer exists on disk, the app restores it and attempts to initialize chat, git, file watcher, and terminal features against that missing directory. This cascades into session creation failures and a dead-end UX with no recovery action.

## 2. Problem Analysis

Current state: `getActive()` returns the persisted active project without validating that its path still exists on disk. The renderer trusts this and proceeds to auto-create a session, initialize file watchers, git views, and terminal -- all of which fail against a missing directory.

- **Approach A: Add `pathMissing` flag to persisted Project type** -- Tag each project with a boolean, add new `StaleProjectView` component. Rejected: pollutes persisted schema, requires large renderer changes.
- **Approach B: Auto-fallback to most recent valid project** -- Silently switch. Rejected: surprising behavior, user doesn't understand what happened.
- **Chosen approach: Multi-layered validation** -- Clear activeProjectId on startup via `getActive()`, validate in `setActive()` and `open()`, tag projects with `pathMissing` in `list()` response (separate `ProjectInfo` type, not persisted), show toast on stale detection, and visually mark stale projects in the ProjectSelector.

## 3. Decision Log

**1. Where to validate path existence?**

- Options: A) Only active project on getActive() - B) All projects on list() + active on getActive() - C) Lazy validation on UI open
- Decision: **B) All projects on list() + active on getActive()** -- The perf impact of N `existsSync` calls is negligible (<1ms for 10 projects). This enables visual indicators in the ProjectSelector without a separate IPC call.

**2. What to do when active project path is missing?**

- Options: A) Return project with `pathMissing` flag - B) Clear activeProjectId and return null - C) Remove the project entirely
- Decision: **B) Clear and return null** -- Leverages all existing null-handling in the renderer. The project stays in the list so user can remove it manually.

**3. How to communicate staleness without polluting the persisted type?**

- Options: A) Add `pathMissing` to `Project` type - B) Separate `ProjectInfo` response type - C) Separate IPC validation method
- Decision: **B) Separate `ProjectInfo` type** -- `ProjectInfo = Project & { pathMissing?: boolean }` used only in contract responses. The persisted `Project` type stays clean.

**4. Should we notify the user when their project is cleared?**

- Options: A) Silent (just show WelcomePanel) - B) Toast notification
- Decision: **B) Toast** -- When `project.refresh()` detects that the active project went from non-null to null, show a warning toast with the project name and missing path. Eliminates the "what just happened?" moment.

**5. Should we validate in setActive?**

- Options: A) Yes, reject with ORPCError - B) No, let getActive handle it on next refresh
- Decision: **A) Yes** -- Without this, clicking a stale project in the selector causes: setActive succeeds -> getActive clears on next refresh -> UI bounces. Rejecting in setActive makes the failure immediate; the renderer catches it and shows a toast.

**6. Should stale projects be visually marked?**

- Options: A) Yes, in ProjectSelector - B) No, user discovers on click
- Decision: **A) Yes** -- Dimmed row + warning icon + "Directory not found" subtitle. Clicking a stale project triggers removal instead of switching. Minimal UI change, big clarity improvement.

## 4. Design

### Shared types

`src/shared/features/project/types.ts`:

```typescript
/** Project enriched with runtime status (not persisted). */
export type ProjectInfo = Project & {
  pathMissing?: boolean;
};
```

### Main process changes

`src/main/features/project/router.ts`:

- **`list`**: Map projects with `pathMissing: !existsSync(p.path)`
- **`getActive`**: If path missing, clear activeProjectId and return null
- **`open`**: Reject with ORPCError if path doesn't exist
- **`setActive`**: Reject with ORPCError if target project's path doesn't exist

### Renderer changes

- **`project/store.ts`**: `projects` typed as `ProjectInfo[]`. `switchToProjectByPath` guards against stale projects and reverts optimistic state on setActive failure.
- **`core/app.tsx`**: `project.refresh()` detects stale clearing (prevActive non-null, newActive null) and shows warning toast via `toastManager.add()`.
- **`use-project.ts`**: `switchProject` catches setActive errors and shows warning toast.
- **`project-selector.tsx`**: Stale projects rendered with `opacity-50`, `TriangleAlertIcon`, "Directory not found -- click to remove" subtitle. Clicking triggers `removeProject` instead of `switchProject`.

### Data flow

```
Startup
  -> main: list() -> each project tagged with pathMissing
  -> main: getActive() -> existsSync fails -> setActive(null) -> return null
  -> renderer: project.refresh() -> detects stale clearing -> shows toast
  -> WelcomePanel rendered, plugins idle
  -> ProjectSelector shows stale project dimmed with warning icon
  -> User can remove stale project or open a new one

Project switch to stale project
  -> renderer: switchProject(id) -> main: setActive(id) -> existsSync fails -> throws ORPCError
  -> renderer: catches error -> shows "Cannot switch" toast
  -> UI stays on current project
```

## 5. Files Changed

- `src/shared/features/project/types.ts` -- Add `ProjectInfo` type
- `src/shared/features/project/contract.ts` -- Use `ProjectInfo[]` for list output
- `src/main/features/project/router.ts` -- Validate in list, getActive, open, setActive
- `src/renderer/src/features/project/store.ts` -- Use `ProjectInfo[]`, guard switchToProjectByPath
- `src/renderer/src/core/app.tsx` -- Detect stale clearing, show toast
- `src/renderer/src/features/project/hooks/use-project.ts` -- Catch setActive errors, show toast
- `src/renderer/src/features/project/components/project-selector.tsx` -- Visual stale indicator
- `src/renderer/src/locales/en-US.json` -- Add i18n string

## 6. Verification

1. Persist a project path, delete the directory, restart the app. Expect: lands on WelcomePanel, toast shows "Project X unavailable -- Directory not found: /path".
2. The deleted project appears dimmed with warning icon in the ProjectSelector.
3. Clicking the stale project in the selector removes it.
4. Trying to switch to a stale project via multi-project session list is blocked.
5. Opening a new project via the selector works normally after recovery.
6. `bun ready` passes (typecheck + lint + format + tests).

## 7. Known Limitations

- **Path disappearing while app is running isn't detected** until the next `getActive()` or `list()` call (e.g., project refresh). Acceptable trade-off.
- **Multi-project session list** still shows sessions for stale projects. Clicking a session belonging to a stale project would trigger `switchToProjectByPath`, which now guards against stale projects and is a no-op.
