# Fix: File Descriptor Exhaustion Crash Loop

**Date**: 2026-03-17
**Status**: Approved, not yet implemented

## Problem

When a user selects a broad parent directory (e.g. `~/Desktop/work` containing 10+ sub-projects) as their project, the app enters a crash loop:

1. **Chokidar watcher** recursively watches the directory (depth:5), opening 2000-4000 FD watchers across all sub-projects
2. **File tree builder** (`getFileTree`) recurses with NO depth limit, opening hundreds of `readdir`/`stat` FDs concurrently via unbounded `Promise.all`
3. Each chokidar `add` event triggers both a tree refresh AND a `git status` spawn — hundreds of concurrent child processes
4. FD limit hit (~256-1024 on macOS) — watcher gets EMFILE, spawns get EBADF
5. No global error handlers — unhandled exception crashes the process
6. On restart, persisted `activeProjectId` auto-loads the same directory — same crash — **loop**

### Log evidence

From user log `2026-03-17.log` (user: mengna, project path: `/Users/mengna/Desktop/work`):

- 5 app restarts in 7 minutes (10:51-10:58)
- `EMFILE: too many open files, watch` on every restart
- `spawn EBADF` on git operations and agent session creation
- User opens directory picker 3 times but app crashes before selection completes
- Later restarts crash without any user interaction (auto-loaded project triggers crash)

### Full crash chain

```
User selects ~/Desktop/work (parent dir with 10+ sub-projects)
  |
  +- watchWorkspace() -- chokidar watches recursively (depth:5)
  |    +- Opens 2000-4000 FD watchers across all sub-projects
  |    +- .node/bin/* files NOT in ignore list -- extra FDs
  |
  +- Each chokidar "add" event triggers:
  |    +- files-view.tsx refresh() -> getFileTree() [NO depth limit]
  |    |    +- fs.readdir + fs.stat on EVERY file recursively -- more FDs
  |    |    +- Promise.all fans out unbounded concurrent IO
  |    +- window "neovate:fs-change" event -> git-view refreshGitStatus()
  |         +- Spawns `git status` child process -- more FDs
  |
  +- Multiple tree builds run CONCURRENTLY (3 within first 3 seconds)
  +- ignore.ts spawns `git rev-parse` + `git ls-files` for exclude patterns -- more FDs
  |
  +- FD limit hit (~256-1024 on macOS)
  |    +- Watcher: EMFILE (too many open files)
  |    +- Spawn: EBADF (bad file descriptor)
  |
  +- No global uncaughtException/unhandledRejection handler
  |    +- Process crashes
  |
  +- On restart: activeProjectId is PERSISTED
       +- Same project auto-loads -> same crash -> LOOP
```

## Design

### Approach chosen

**Resource Caps** -- add hard limits to prevent FD exhaustion, plus a circuit breaker for the crash loop. Allow broad directories but handle gracefully.

---

### Section 1: Crash Loop Breaker (Smart Circuit Breaker)

**Files**: `src/main/index.ts`, `src/main/features/project/project-store.ts`

#### 1a. Global error handlers

Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers at the top of the main entry point:

1. Log the error with full stack trace
2. Increment crash counter (see 1b)
3. Let the process exit naturally after cleanup (don't swallow the error)

#### 1b. Crash counter via existing project store

Instead of unconditionally clearing `activeProjectId` on any EMFILE/EBADF (too blunt), track consecutive crashes.

**Important**: Do NOT use a separate `crash-state.json` file. During EMFILE, opening new files fails. Instead, add `crashCount` and `lastCrashTs` fields to the existing `ProjectStore` schema (backed by `electron-store`, which keeps its file handle open for the process lifetime). Writing to an already-open handle is reliable even under FD pressure.

- In the `uncaughtException`/`unhandledRejection` handler: increment `crashCount` and set `lastCrashTs` via the project store, then exit.
- On startup: if `crashCount >= 3` and `lastCrashTs` is within the last 60 seconds, clear `activeProjectId`. This breaks the loop.
- On successful boot (30s of uptime without crash): reset `crashCount` to 0.

This avoids nuking the active project on a single transient crash, and the write is reliable because no new FD is needed.

---

### Section 2: Lazy File Watching (Panel-Aware + Expanded-Only)

**Files**: `src/main/plugins/files/watch.ts`, `src/renderer/src/plugins/files/files-view.tsx`, `src/renderer/src/plugins/files/index.tsx`

The current watcher creates a single recursive chokidar instance on the entire project directory (depth:5) the moment the files view mounts -- even when the panel is collapsed or offscreen. This is the primary cause of FD exhaustion.

Replace with a lazy, user-driven approach:

#### 2a. Panel-aware lifecycle -- only watch when visible

The files plugin currently uses `deactivation: "offscreen"`, which keeps the component always mounted. The `useEffect` in `files-view.tsx:50` starts watching on mount regardless of visibility.

Fix: add a visibility check inside the effect using the layout store:

```ts
const isVisible = useLayoutStore(
  (s) => !s.panels.secondarySidebar.collapsed && s.panels.secondarySidebar.activeView === "files",
);
```

Only subscribe to the watcher when `isVisible` is true. When the user switches to git/search/terminal or collapses the sidebar, unwatch everything. Keep `deactivation: "offscreen"` so tree expansion state is preserved across panel switches.

#### 2b. Watch only expanded directories (lazy watching)

Instead of one recursive chokidar watcher on the entire project root:

1. Watch only the **root directory** with `depth: 0` when the panel opens
2. When the user **expands a folder** in the tree UI, add that specific folder to the watch set (also `depth: 0`)
3. When they **collapse** it, remove it from the watch set

This changes FD usage from `O(all files in project)` to `O(currently expanded folders)` -- typically 5-20 FDs instead of thousands.

**Main process changes** (`watch.ts`): Change `watchWorkspace(dir)` to use `depth: 0` instead of `depth: 5`. Each call watches a single flat directory. No other API changes needed.

**Renderer changes** (`files-view.tsx`): Manage multiple independent `client.files.watch({ cwd })` iterators -- one per expanded folder:

- On panel visible + cwd set: start one iterator for the root directory
- On `handleToggleExpand(key)`: if expanding, start a new iterator for that folder; if collapsing, cancel its iterator
- On panel hide / project switch: cancel all iterators
- Each watcher event only refreshes its own directory's children, not the entire tree

**No contract changes needed** -- reuse the existing `files.watch` contract with multiple concurrent calls. The renderer controls granularity.

#### 2c. Safety cap (defense in depth)

Even with lazy watching, keep a `MAX_WATCHED_DIRS = 100` cap as a safety net. If hit, stop accepting new watch requests and yield a `{ type: "truncated" }` sentinel so the renderer shows a warning.

#### 2d. Add `.node` to ignore patterns

The log shows many `.node/bin/*` files being watched unnecessarily. Add to the ignore array:

```js
/\.node\//,  // .node directories (native bindings)
```

---

### Section 3: Lazy Tree Loading

**Files**: `src/main/plugins/files/tree.ts`, `src/main/plugins/files/router.ts`, `src/renderer/src/plugins/files/files-view.tsx`

Currently `getFileTree()` recursively reads the ENTIRE directory tree on panel open. Even with depth/entry limits, this opens thousands of FDs for large directories. With lazy watching (Section 2), tree loading should also be lazy.

#### 3a. Single-level tree fetching

Replace `getFileTree(parent)` (recursive) with a flat, single-level listing: read only the **immediate children** of the given directory. No recursion, no `Promise.all` fan-out. Each call is one `readdir` + `stat` per entry.

This eliminates the need for `maxDepth`, `maxEntries`, and sequential traversal -- each call is inherently bounded to one directory.

#### 3b. Pass project root for exclude pattern caching

The `files.tree` contract should accept both the folder to list AND the project root:

```ts
client.files.tree({ cwd: expandedFolderPath, root: projectRoot });
```

`tree.ts` uses `root` (not `cwd`) as the cache key for `getExcludePatterns()`. Without this, each folder expansion creates a new cache miss and spawns `git rev-parse` + `git ls-files` (2 child processes per expansion). With the project root as key, all expansions share a single cached set of exclude patterns.

#### 3c. On-demand children loading in renderer

When the user **expands** a folder in the tree UI:

1. Fetch that folder's immediate children via `client.files.tree({ cwd: folderPath, root: projectRoot })`
2. Insert them into the tree state under the expanded node

When the user **collapses** a folder, the children can stay in state (no re-fetch on re-expand) or be cleared (saves memory for huge dirs). Keeping them is simpler.

#### 3d. Debounce refresh on watcher events

When a watcher event fires for a specific directory, only re-fetch that directory's children (not the entire tree). Debounce these refreshes (500ms) and use a "latest wins" pattern to discard stale results.

This replaces the old Section 4 (tree build debounce) -- the problem goes away because we never build the full tree.

---

### Section 5: User-Visible Feedback When Caps Are Hit

When the watcher or tree builder hits its limit, the user currently sees a silently truncated file tree with no explanation.

Add a subtle indicator in the files panel when truncation occurs (e.g. "File tree truncated -- directory too large"). The tree builder returns `truncated: true`, the watcher emits a truncation event. The renderer shows a small info bar at the bottom of the file tree.

---

### Section 6: Avoid Unnecessary Spawns in `getExcludePatterns`

**File**: `src/main/plugins/files/utils/ignore.ts:51`

`collectGitignoreRules` spawns `git rev-parse --git-dir` and `git ls-files` via `execAsync`. For non-git directories like `/Users/mengna/Desktop/work`, these spawns fail -- wasted FDs under pressure.

Fix: check for `.git` directory existence with `fs.existsSync(join(rootPath, '.git'))` before spawning git processes. Skip the git commands entirely if no `.git` directory is found.

---

### Section 7: Don't Permanently Cache Shell Env Failures

**File**: `src/main/features/agent/shell-env.ts`

`getShellEnvironment()` is called eagerly at startup (`index.ts:31`). If `extractEnvFromShell()` fails with EBADF during FD exhaustion, the result `cached = {}` is stored permanently for the process lifetime. Every subsequent agent session gets zero environment variables -- no `PATH`, no `HOME`. Sessions are non-functional even after FD pressure subsides.

Fix: only cache on success. On failure, return `{}` but leave `cached` unset so the next call retries. Add a simple cooldown (e.g. don't retry more than once per 10 seconds) to avoid hammering spawn during sustained EMFILE.

```ts
// BEFORE
catch { cached = {}; }

// AFTER
catch { /* don't cache -- next call will retry */ return {}; }
```

---

### Section 8: Decouple Git-View from Files Panel

**File**: `src/renderer/src/plugins/git/git-view.tsx`

Git-view currently listens to the global `neovate:fs-change` event (dispatched by files-view) to trigger `refreshGitStatus()`. This creates two problems:

1. **Coupling**: with lazy watching, `neovate:fs-change` only fires for expanded directories. Changes in non-expanded folders won't trigger git status refresh.
2. **Listener bug**: the cleanup at line 111 uses `addEventListener` instead of `removeEventListener`, leaking listeners on every `cwd` change.

Fix: remove the `neovate:fs-change` listener entirely. Give git-view its own independent trigger. Two options (pick one):

- **Watch `.git/index`**: a single shallow watcher on the project's `.git` directory catches most status changes (commits, staging, branch switches) with exactly 1-2 FDs. Only run when git panel is visible.
- **Interval poll**: `refreshGitStatus()` on a simple interval (e.g. every 5s) when the git panel is visible. Simpler, no watcher needed, slightly less responsive.

Both should be **panel-aware** (same pattern as files-view in Section 2a) -- only active when the git panel is the active secondary sidebar view and the sidebar is not collapsed.

This eliminates the `neovate:fs-change` global event coupling. The files-view no longer needs to dispatch it -- watcher events stay local to the files panel.

### Section 9: Pass parent window to dialog.showOpenDialog()

**File**: `src/main/features/project/router.ts:80`

Currently called without a parent window. Pass `BrowserWindow.getFocusedWindow()` so the dialog is properly parented on macOS and won't become orphaned on window reload.

---

## All Issues Found

| #   | Issue                                                                   | File                               | Severity |
| --- | ----------------------------------------------------------------------- | ---------------------------------- | -------- |
| 1   | No global error handlers (`uncaughtException`/`unhandledRejection`)     | `main/index.ts`                    | Critical |
| 2   | `getFileTree()` reads entire tree recursively -- unbounded FD fan-out   | `files/tree.ts`                    | Critical |
| 3   | Watcher watches entire project recursively even when panel hidden       | `files/watch.ts`, `files-view.tsx` | Critical |
| 4   | Persisted `activeProjectId` causes crash loop on restart                | `project-store.ts`                 | Critical |
| 5   | Watcher truncation causes renderer reconnect loop (no sentinel)         | `watch.ts` + `files-view.tsx`      | Critical |
| 6   | Git-view coupled to files panel via `neovate:fs-change` + listener leak | `git-view.tsx:108-111`             | High     |
| 7   | `getExcludePatterns` spawns git processes for non-git dirs              | `files/utils/ignore.ts:51`         | High     |
| 8   | Shell env permanently caches `{}` on spawn failure                      | `shell-env.ts`                     | High     |
| 9   | `dialog.showOpenDialog()` called without parent window                  | `project/router.ts:80`             | Medium   |
| 10  | No user feedback when watcher cap is hit                                | `files-view.tsx`                   | Medium   |
| 11  | `.node/bin/*` not in ignore patterns                                    | `files/watch.ts:56-69`             | Low      |

## Files to Modify

1. `packages/desktop/src/main/index.ts` -- global error handlers + crash counter
2. `packages/desktop/src/main/features/project/project-store.ts` -- add `crashCount`/`lastCrashTs` fields
3. `packages/desktop/src/main/plugins/files/watch.ts` -- depth:0 per-directory watchers, safety cap, ignore patterns, truncation sentinel
4. `packages/desktop/src/main/plugins/files/tree.ts` -- single-level listing (no recursion)
5. `packages/desktop/src/main/plugins/files/utils/ignore.ts` -- skip git spawns for non-git dirs
6. `packages/desktop/src/main/features/agent/shell-env.ts` -- don't cache failures, retry with cooldown
7. `packages/desktop/src/main/features/project/router.ts` -- parent window for dialog
8. `packages/desktop/src/renderer/src/plugins/files/files-view.tsx` -- panel-aware lifecycle, lazy watch per expanded folder, lazy tree loading, debounced per-directory refresh, truncation indicator
9. `packages/desktop/src/renderer/src/plugins/git/git-view.tsx` -- decouple from fs-change, own trigger (`.git` watcher or interval poll), panel-aware
10. `packages/desktop/src/main/features/agent/shell-env.ts` -- don't cache failures, retry with cooldown
11. `packages/desktop/src/main/features/project/router.ts` -- parent window for dialog
12. `packages/desktop/src/renderer/src/plugins/files/files-view.tsx` -- panel-aware lifecycle, lazy watch on expand/collapse, debounce/cancel tree builds, truncation indicator
13. `packages/desktop/src/renderer/src/plugins/git/git-view.tsx` -- listener leak fix, debounce git status
