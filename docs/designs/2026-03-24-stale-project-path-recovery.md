# Stale Project Path Recovery

## 1. Background

GitHub issue #286. When a remembered project path no longer exists on disk, the app restores it and attempts to initialize chat, git, file watcher, and terminal features against that missing directory. This cascades into session creation failures and a dead-end UX with no recovery action.

## 2. Problem Analysis

Current state: `getActive()` returns the persisted active project without validating that its path still exists on disk. The renderer trusts this and proceeds to auto-create a session, initialize file watchers, git views, and terminal — all of which fail against a missing directory.

- **Approach A: Add `pathMissing` flag to Project type** — Tag each project with a boolean, add new `StaleProjectView` component. Rejected: pollutes persisted schema, requires changes across renderer.
- **Approach B: Auto-fallback to most recent valid project** — Silently switch. Rejected: surprising behavior, user doesn't understand what happened.
- **Chosen approach: Clear activeProjectId when path is missing** — In `getActive()`, if `existsSync(project.path)` is false, clear `activeProjectId` and return `null`. The renderer already handles `null` activeProject gracefully everywhere (WelcomePanel, disabled plugins, "No project" in title bar with ProjectSelector dropdown). ~15 lines of code, no new types or components.

## 3. Decision Log

**1. Where to validate path existence?**

- Options: A) All projects on every list() call · B) Only active project on getActive() · C) Both
- Decision: **B) Only active project** — The cascade only triggers for the active project. Checking all projects adds unnecessary synchronous I/O per list() call.

**2. What to do when path is missing?**

- Options: A) Return project with `pathMissing` flag · B) Clear activeProjectId and return null · C) Remove the project entirely
- Decision: **B) Clear and return null** — Leverages all existing null-handling in the renderer. The project stays in the list so user can remove it manually.

**3. Should we add recovery UI?**

- Options: A) New StaleProjectView component · B) Rely on existing WelcomePanel + ProjectSelector
- Decision: **B) Existing UI** — WelcomePanel shows "Open Project" button. Title bar ProjectSelector lets user switch or remove projects. No new UI needed.

**4. Should we validate in open/create handlers too?**

- Options: A) Yes · B) No, only getActive
- Decision: **A) Yes** — Prevents storing bad paths at the source. Both the new-project and existing-project-reactivation code paths in `open` need the guard.

## 4. Design

### Main process changes

**`src/main/features/project/router.ts` — `getActive` handler:**

After fetching the active project from the store, check `existsSync(project.path)`. If the path is missing, clear the active project and return null:

```typescript
getActive: handler(({ context }) => {
  const project = context.projectStore.getActive();
  if (project && !existsSync(project.path)) {
    log("active project path missing, clearing: %s", project.path);
    context.projectStore.setActive(null);
    return null;
  }
  return project;
}),
```

**`src/main/features/project/router.ts` — `open` handler:**

Add `existsSync` check before both the existing-project reactivation branch and the new-project creation branch:

```typescript
open: handler(({ input, context }) => {
  if (!existsSync(input.path)) {
    throw new ORPCError("BAD_REQUEST", { message: "Directory does not exist" });
  }
  // ... existing logic
}),
```

### Renderer behavior (no changes needed)

When `activeProject` is null:

- `AgentChat`: renders `WelcomePanel` with `hasProject={false}` (no session auto-create)
- `SingleProjectSessionList`: shows "Select a project" message
- `AppLayoutPrimaryTitleBar`: shows "No project" with ProjectSelector dropdown (user can switch/remove/open)
- All content panel plugins: idle (no cwd to operate on)
- The stale project remains in `projects[]` and is visible in the ProjectSelector for removal

### Data flow

```
Startup
  → main: getActive() → existsSync fails → setActive(null) → return null
  → renderer: project.refresh() → activeProject = null
  → WelcomePanel rendered, plugins idle
  → User clicks ProjectSelector → switches to valid project or opens new one
  → User can delete stale project from ProjectSelector dropdown
```

## 5. Files Changed

- `src/main/features/project/router.ts` — Add existsSync check in `getActive` and `open` handlers

## 6. Verification

1. Persist a project path, delete the directory, restart the app. Expect: lands on WelcomePanel, no crashes, no session init errors.
2. The deleted project still appears in the ProjectSelector dropdown and can be removed.
3. Opening a new project via the selector works normally.
4. `bun ready` passes (typecheck + lint + format + tests).

## 7. Known Limitations

- **No visual distinction for stale projects in the list.** They look like normal projects. User discovers staleness when they try to switch to one (setActive succeeds in store, but getActive() clears it on next refresh, causing a UI bounce back to no-project state). Acceptable for initial fix; visual indicators can be added as a follow-up.
- **Path disappearing while app is running isn't detected** until the next `getActive()` call (e.g., project refresh). Acceptable trade-off.
- **No toast/notification explaining why the active project was cleared.** The user sees the generic WelcomePanel. Could add in a follow-up.
