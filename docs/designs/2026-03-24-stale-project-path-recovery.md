# Stale Project Path Recovery

## 1. Background

GitHub issue #286. When a remembered project path no longer exists on disk, the app restores it and attempts to initialize chat, git, file watcher, and terminal features against that missing directory. This cascades into session creation failures and a dead-end UX with no recovery action.

## 2. Problem Analysis

Current state: `getActive()` returns the persisted active project without validating that its path still exists on disk. The renderer trusts this and proceeds to auto-create a session, initialize file watchers, git views, and terminal -- all of which fail against a missing directory.

- **Approach A: Add `pathMissing` flag to persisted Project type** -- Tag each project with a boolean, add new `StaleProjectView` component. Rejected: pollutes persisted schema, requires large renderer changes.
- **Approach B: Auto-fallback to most recent valid project** -- Silently switch. Rejected: surprising behavior, user doesn't understand what happened.
- **Chosen approach: Multi-layered validation** -- Clear activeProjectId on startup via `getActive()`, validate in `setActive()` and `open()`, tag projects with `pathMissing` in `list()` response (separate `ProjectInfo` type, not persisted), show toast on stale detection, and visually mark stale projects in both the ProjectSelector and multi-project accordion.

## 3. Decision Log

**1. Where to validate path existence?**

- Options: A) Only active project on getActive() - B) All projects on list() + active on getActive() - C) Lazy validation on UI open
- Decision: **B) All projects on list() + active on getActive()** -- The perf impact of N `existsSync` calls is negligible (<1ms for 10 projects). This enables visual indicators in both the ProjectSelector and accordion without separate IPC calls.

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

- Options: A) Yes, in ProjectSelector and accordion - B) No, user discovers on click
- Decision: **A) Yes** -- Dimmed row + warning icon + "Directory not found" subtitle in ProjectSelector. Stale accordion items show warning icon, hide "new session" button and sessions panel, keep delete always visible.

**7. Should we cache existsSync calls in list()?**

- Options: A) No caching, call existsSync every time - B) Cache with TTL
- Decision: **B) Cache with 5s TTL** -- `list()` may be called frequently (accordion expansion, project refresh). A `Map<string, { exists: boolean; ts: number }>` with 5s TTL avoids redundant filesystem checks while staying responsive to directory changes.

**8. Should clicking a stale project in the selector remove it?**

- Options: A) Click removes the project - B) Click is a no-op, delete button always visible
- Decision: **B) No-op + visible delete** -- Clicking a stale row to remove it is destructive and surprising. Instead, the row click is disabled for stale projects and the delete icon is always visible (not just on hover), making the action explicit.

**9. Should toast messages be i18n'd?**

- Options: A) Hardcoded English - B) Use i18n keys
- Decision: **B) i18n keys** -- All other UI text uses `react-i18next`. Toast messages in `app.tsx` (class context) use `i18n.t()` directly from i18next; toast messages in hooks use `useTranslation()`.

**10. Should switchProject distinguish stale-path errors from other failures?**

- Options: A) Catch all errors with same message - B) Check error type and show specific message
- Decision: **B) Check error type** -- Use `instanceof ORPCError` + `code === "BAD_REQUEST"` to identify stale-path errors. Show "Directory no longer exists" for stale paths, "An unexpected error occurred" for other failures. Also refresh the project list after a stale-path error so the UI immediately reflects the stale state.

**11. Should stale accordion items have a collapsible trigger?**

- Options: A) Keep trigger (expand/collapse does nothing visible) - B) Replace trigger with static element
- Decision: **B) Static element** -- Since the sessions panel is hidden for stale projects, the accordion trigger toggles nothing. Replace `AccordionPrimitive.Trigger` with a plain `div` for stale items to avoid the confusing empty-toggle interaction.

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

- **`list`**: Map projects with `pathMissing: !pathExists(p.path)` using a cached helper
- **`getActive`**: If path missing, clear activeProjectId and return null
- **`open`**: Reject with ORPCError if path doesn't exist
- **`setActive`**: Reject with ORPCError if target project's path doesn't exist
- **`pathExists` helper**: Cached `existsSync` with 5s TTL to avoid redundant filesystem checks

### Renderer changes

- **`project/store.ts`**: `projects` typed as `ProjectInfo[]`. `switchToProjectByPath` guards against stale projects (`project.pathMissing`) and reverts optimistic state on setActive failure.
- **`core/app.tsx`**: `project.refresh()` detects stale clearing (prevActive non-null, newActive null) and shows i18n'd warning toast via `i18n.t()` + `toastManager.add()`.
- **`use-project.ts`**: `switchProject` catches setActive errors, distinguishes stale-path (`ORPCError` with `BAD_REQUEST`) from other failures, shows appropriate i18n'd toast. Refreshes project list after stale-path errors.
- **`project-selector.tsx`**: Stale projects rendered with `opacity-50`, `TriangleAlertIcon`, "Directory not found" subtitle. Row click disabled for stale projects. Delete icon always visible for stale rows.
- **`project-accordion-list.tsx`**: Stale accordion items show warning icon replacing folder icon, `opacity-50`, delete button always visible, "new session" button hidden, sessions panel hidden. Accordion trigger replaced with static element for stale items (no expand/collapse).

### Data flow

```
Startup
  -> main: list() -> each project tagged with pathMissing (cached existsSync)
  -> main: getActive() -> existsSync fails -> setActive(null) -> return null
  -> renderer: project.refresh() -> detects stale clearing -> shows toast
  -> WelcomePanel rendered, plugins idle
  -> ProjectSelector & accordion show stale project dimmed with warning icon
  -> User can remove stale project or open a new one

Project switch to stale project
  -> renderer: switchProject(id) -> main: setActive(id) -> existsSync fails -> throws ORPCError
  -> renderer: catches error -> shows "Cannot switch" toast
  -> UI stays on current project

Session click in stale project accordion
  -> renderer: switchToProjectByPath(path) -> finds project with pathMissing -> returns (no-op)
  -> UI stays on current project
```

## 5. Files Changed

- `src/shared/features/project/types.ts` -- Add `ProjectInfo` type
- `src/shared/features/project/contract.ts` -- Use `ProjectInfo[]` for list output
- `src/main/features/project/router.ts` -- Validate in list (with cache), getActive, open, setActive
- `src/renderer/src/features/project/store.ts` -- Use `ProjectInfo[]`, guard switchToProjectByPath
- `src/renderer/src/core/app.tsx` -- Detect stale clearing, show toast
- `src/renderer/src/features/project/hooks/use-project.ts` -- Catch setActive errors, show toast
- `src/renderer/src/features/project/components/project-selector.tsx` -- Visual stale indicator, non-destructive click
- `src/renderer/src/features/agent/components/project-accordion-list.tsx` -- Stale indicators in multi-project accordion
- `src/renderer/src/locales/en-US.json` -- Add i18n strings for stale project toasts

## 6. Verification

1. Persist a project path, delete the directory, restart the app. Expect: lands on WelcomePanel, toast shows "Project X unavailable -- Directory not found: /path".
2. The deleted project appears dimmed with warning icon in the ProjectSelector.
3. Clicking a stale project row in the selector does nothing; the delete icon is always visible.
4. The deleted project appears dimmed with warning icon in the multi-project accordion, with no "new session" button and no sessions panel.
5. Trying to switch to a stale project via multi-project session list is blocked (switchToProjectByPath no-op).
6. Opening a new project via the selector works normally after recovery.
7. `bun ready` passes (typecheck + lint + format + tests).

## 7. Known Limitations

- **Path disappearing while app is running isn't detected** until the next `getActive()` or `list()` call (e.g., project refresh). Acceptable trade-off.
- **Path cache staleness**: The 5s TTL means a path restored within 5s of deletion won't be detected until the cache expires. Acceptable for this edge case.
