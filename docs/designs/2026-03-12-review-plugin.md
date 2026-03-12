# Review Plugin Design

## Overview

A new **`plugin-review`** renderer plugin + main-process plugin that adds a `ContentPanelView` tab for reviewing file diffs. Supports four diff categories via a `<Select>` dropdown: **Unstaged**, **Staged**, **Last Turn** (changes made by Claude in the most recent agent turn), and **Branch** (local vs. upstream tracking branch).

## Decisions

- **Separate plugin** — does not modify or replace the existing git plugin/diff view
- **Last turn diffs** — enabled via `enableFileCheckpointing` in the SDK; uses `git stash create` pre-turn snapshot + `rewindFiles(dryRun: true)` for accurate per-turn diffs
- **All diffs inline** — stacked vertically (GitHub PR-style), one `MultiFileDiff` per file
- **Category switcher** — `<Select>` dropdown (not tabs)
- **Diff style toggle** — `unified` (default) / `split` via `@pierre/diffs` `diffStyle` option
- **Auto-refresh** — review panel auto-refreshes when an agent turn completes
- **Lazy diff loading** — fetch file list first, load per-file diff content on expand/scroll
- **Branch endpoints in git router** — branch-related git operations live in the git contract, not the review contract
- **File guards** — binary files show placeholder, large files (>1MB) show "too large" with editor link, 100+ files warn and collapse all
- **Chat checkpoint integration** — "Review changes" button on chat checkpoint opens review panel with "Last Turn" pre-selected
- **`preTurnRef` fallback** — when `git stash create` returns empty (clean tree), fall back to `HEAD`
- **Overflow menu** — `...` button in top-right header with actions (Refresh, Show/Hide File Tree, Expand All, Collapse All)
- **Shared session hook** — `useActiveSession()` hook for cross-plugin access to the active agent sessionId
- **Persisted UI state** — file tree visibility and diff style stored in `Tab.state` for per-project persistence

## Data Flow

All four categories follow the same **list → expand → load** pattern. The file list is fetched upfront (lightweight — names + status only). Per-file diff content is loaded lazily when the user expands a file section or scrolls it into view.

| Category  | File list endpoint          | Per-file diff endpoint          |
| --------- | --------------------------- | ------------------------------- |
| Unstaged  | `git.files()` → `working[]` | `git.diff(file, "working")`     |
| Staged    | `git.files()` → `staged[]`  | `git.diff(file, "staged")`      |
| Last Turn | `review.lastTurnFiles()`    | `review.lastTurnDiff(file)`     |
| Branch    | `git.branchFiles(cwd)`      | `git.branchFileDiff(cwd, file)` |

### Unstaged & Staged

Reuse the existing git oRPC contract:

- `git.files({ cwd })` → `{ working: GitFile[], staged: GitFile[] }`
- `git.diff({ cwd, file, type: "working" | "staged" })` → `{ oldContent, newContent }` (loaded per-file on expand)

### Last Turn

1. Enable `enableFileCheckpointing: true` in `SessionManager.queryOptions()`
2. Track user message UUIDs — store the UUID from each `SDKUserMessage` pushed to the SDK (updated in `SessionManager.stream()` before each push)
3. **Pre-turn snapshot** — before pushing each user message in `stream()`, run `git stash create` in the session's cwd. This creates a commit ref of the current working tree + index state **without modifying the working tree**. Store the ref as `preTurnRef` per session.
4. New oRPC endpoint: `review.lastTurnFiles(sessionId)` calls `query.rewindFiles(lastUserMessageId, { dryRun: true })` → returns `{ filesChanged: string[], insertions: number, deletions: number }`
5. New oRPC endpoint: `review.lastTurnDiff(sessionId, file)` — for each file in `filesChanged`, runs `git diff <preTurnRef> -- <file>` to get the exact changes Claude made, then parses old/new content from the diff output. Falls back to reading current file content as "new file" when the file didn't exist pre-turn.

This approach gives **accurate per-turn diffs** even when the user has pre-existing uncommitted changes to the same files.

### Branch

Shows the combined file diff between the local branch and its upstream tracking branch — like viewing a PR diff locally.

**Data flow:**

1. Get current branch + tracking info via existing `git.branches({ cwd })` — returns `GitBranch` with `name`, `tracking`, `ahead`, `behind`
2. New git contract endpoint: `git.branchFiles({ cwd })` — runs `git diff <tracking>...HEAD --name-status` → returns file list with status (lightweight, no content)
3. New git contract endpoint: `git.branchFileDiff({ cwd, file })` — for a single file, reads old content via `git show <tracking>:<file>` and new content via `git show HEAD:<file>` (loaded lazily per-file on expand)
4. The select dropdown shows the Branch option as: **`main > origin/main`** (dynamically using actual branch/tracking names)

**Edge cases:**

| Case                   | Behavior                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| No tracking branch     | Select option shows `Branch (no upstream)`, disabled. Empty state message: "No upstream tracking branch configured. Run `git push -u` to set one." |
| Remote branch deleted  | Show error state: "Upstream branch `origin/foo` no longer exists."                                                                                 |
| Detached HEAD          | Select option shows `Branch (detached HEAD)`, disabled. Empty state: "Cannot compare — HEAD is detached."                                          |
| Branch up to date      | Show empty state: "Branch is up to date with `origin/main`."                                                                                       |
| Branch behind remote   | Still shows the diff (local commits diverging from merge-base). Stats note: "N commits ahead, M behind `origin/main`"                              |
| Branch diverged        | Show diff from merge-base to HEAD (same as `git diff tracking...HEAD`). Stats note shows ahead/behind counts.                                      |
| Stale remote ref       | Show a "Fetch" button in the header alongside Refresh. Clicking runs `git fetch` for the tracking remote before re-diffing.                        |
| New file on branch     | `git show <tracking>:<file>` fails → treat as new file (oldContent = "")                                                                           |
| Deleted file on branch | `git show HEAD:<file>` fails → treat as deleted file (newContent = "")                                                                             |
| Binary files           | Skip diff rendering, show "Binary file changed" placeholder                                                                                        |

## Plugin Structure

```
src/
├── main/plugins/review/
│   ├── index.ts          # MainPlugin — registers review router
│   └── router.ts         # oRPC: lastTurnFiles, lastTurnDiff (agent-specific only)
│
├── renderer/src/plugins/review/
│   ├── index.tsx          # RendererPlugin — contributes ContentPanelView "review"
│   ├── review-view.tsx    # Main view: select dropdown + inline multi-file diffs
│   ├── hooks/
│   │   └── useReview.ts   # Data fetching (git files/diffs + last turn files)
│   └── locales/
│       ├── en-US.json
│       └── zh-CN.json
│
└── shared/plugins/review/
    └── contract.ts        # oRPC contract for review endpoints
```

## UI Layout

Select dropdown options:

```
  ▾ Unstaged
  ──────────────
  Unstaged
  Staged
  Last Turn
  main > origin/main        ← dynamic branch names
```

When tracking branch is missing: `Branch (no upstream)` — disabled.
When detached HEAD: `Branch (detached HEAD)` — disabled.

Panel layout (file tree hidden — default):

```
┌──────────────────────────────────────────────────┐
│  [▾ Unstaged ∨]              [≡ ⇄]       [···]  │  ← header bar
├──────────────────────────────────────────────────┤
│  3 files changed, +42 -15                        │  ← Stats summary
├──────────────────────────────────────────────────┤
│  ┌─ src/foo.ts (M) ─────────────────────────┐   │
│  │  - old line                               │   │  ← @pierre/diffs
│  │  + new line                               │   │     MultiFileDiff
│  └───────────────────────────────────────────┘   │     per file
│  ┌─ src/bar.ts (A) ─────────────────────────┐   │
│  │  + new file content                       │   │     stacked
│  └───────────────────────────────────────────┘   │     vertically
│  ...                                             │
└──────────────────────────────────────────────────┘
```

Panel layout (file tree shown — via `...` → "Show File Tree"):

```
┌──────────────────────────────────────────────────┐
│  [▾ Unstaged ∨]              [≡ ⇄]       [···]  │  ← header bar (shared)
├──────────────────────────────────────┬───────────┤
│  3 files changed, +42 -15           │ Files     │
├──────────────────────────────────────┤───────────┤
│  ┌─ src/foo.ts (M) ────────────┐    │ ● foo.ts M│  ← clicking scrolls
│  │  - old line                 │    │   bar.ts A│     diff area to
│  │  + new line                 │    │   baz.ts D│     that file
│  └─────────────────────────────┘    │           │
│  ┌─ src/bar.ts (A) ────────────┐    │           │  ← active file
│  │  + new file content         │    │           │     highlighted (●)
│  └─────────────────────────────┘    │           │
│  ...                                │           │
└──────────────────────────────────────┴───────────┘
```

File tree sidebar:

- Fixed-width (~200px) on the right, below the header bar
- Shows flat file list with filename + status badge (M/A/D/U)
- Clicking a file scrolls the diff area to that file's section
- Active file (currently scrolled into view) highlighted in the tree
- Scroll position syncs both ways: scrolling diffs updates the tree highlight, clicking tree scrolls diffs

**`...` overflow menu** (top-right): opens a dropdown with actions:

- Refresh — re-fetches file list and diffs for the active category
- Show/Hide File Tree — toggles the right file tree sidebar
- Expand All — expands all file sections, triggers batch diff loading (max 5 concurrent fetches)
- Collapse All — collapses all file sections

Other UI details:

- **Diff style toggle**: `≡` = unified (default), `⇄` = split — passed to `@pierre/diffs` `diffStyle` option
- Each file: collapsible section with header showing filename + status badge (M/A/D/U). Diff content loaded lazily on expand.
- Empty state per category when no changes
- Loading spinner per-file while fetching its diff content
- Stats summary line: "N files changed, +X -Y"
- Branch mode stats: "N files changed, +X -Y · 3 ahead, 1 behind origin/main"
- Branch mode header: optional "Fetch" button (runs `git fetch`) when remote ref may be stale

## Main Process Changes

### SessionManager

1. **`queryOptions()`** — add `enableFileCheckpointing: true` to the returned `Options`
2. **Per-session state** — add `lastUserMessageId: string | undefined` and `preTurnRef: string | undefined` to the session map entry
3. **`stream()`** — before `session.input.push(...)`:
   - Generate a UUID and assign it as `uuid` on the `SDKUserMessage`, store as `lastUserMessageId`
   - Run `git stash create` in session cwd, store result as `preTurnRef`. If the command returns empty (clean working tree + clean index), fall back to `HEAD` so `git diff HEAD -- <file>` still produces accurate last-turn diffs.
4. Expose `lastTurnFiles(sessionId)` — calls `query.rewindFiles(lastUserMessageId, { dryRun: true })`
5. Expose `lastTurnDiff(sessionId, file)` — runs `git diff <preTurnRef> -- <file>` or `git diff -- <file>` (fallback when no preTurnRef), parses into `{ oldContent, newContent }`

### Review Router (agent-specific endpoints)

```typescript
// shared/plugins/review/contract.ts
export const reviewContract = {
  lastTurnFiles: oc.input(z.object({ sessionId: z.string() })).output(type<RewindFilesResult>()),
  lastTurnDiff: oc
    .input(z.object({ sessionId: z.string(), file: z.string() }))
    .output(type<{ oldContent: string; newContent: string }>()),
};
```

```typescript
// main/plugins/review/router.ts
lastTurnFiles: handler(async ({ input, context }) => {
  return context.sessionManager.lastTurnFiles(input.sessionId);
}),
lastTurnDiff: handler(async ({ input, context }) => {
  return context.sessionManager.lastTurnDiff(input.sessionId, input.file);
}),
```

### Git Contract Additions (branch diff endpoints)

Added to existing `shared/plugins/git/contract.ts`:

```typescript
// New types
interface GitBranchFile {
  relPath: string;
  fileName: string;
  extName: string;
  status: "added" | "modified" | "deleted";
}

interface GitBranchFilesResponse {
  success: boolean;
  data?: {
    local: string;            // e.g. "main"
    tracking: string;         // e.g. "origin/main"
    ahead: number;
    behind: number;
    files: GitBranchFile[];
  };
  error?: string;             // "no_upstream" | "detached_head" | "remote_gone"
}

// New endpoints in gitContract
branchFiles: oc
  .input(type<{ cwd: string }>())
  .output(type<GitBranchFilesResponse>()),
  // git diff <tracking>...HEAD --name-status → file list only

branchFileDiff: oc
  .input(type<{ cwd: string; file: string }>())
  .output(type<GitDiffResponse>()),
  // git show <tracking>:<file> → oldContent
  // git show HEAD:<file> → newContent
```

## Renderer Plugin Registration

```typescript
// renderer/src/plugins/review/index.tsx
const plugin: RendererPlugin = {
  name: "plugin-review",
  configI18n() {
    /* locales loader */
  },
  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "review",
          name: "Review",
          singleton: true,
          deactivation: "offscreen",
          icon: ReviewIcon,
          component: () => import("./review-view"),
        },
      ],
    };
  },
};
```

## Active Session Access

The review plugin needs the active agent `sessionId` for "Last Turn" endpoints. Rather than coupling to the agent store directly, introduce a shared `useActiveSession()` hook:

```typescript
// renderer/src/hooks/useActiveSession.ts
// Reads the active sessionId from the agent store and exposes it
// as a stable, importable hook for any plugin.
export function useActiveSession(): { sessionId: string | null; cwd: string | null };
```

- Located in `renderer/src/hooks/` (shared across plugins)
- Returns `null` when no session is active — the review panel disables the "Last Turn" option in that case
- The agent feature already maintains this state; the hook is a thin read-only accessor

## UI State Persistence

File tree visibility and diff style preference are stored in the existing `Tab.state` mechanism (`Tab.state: Record<string, unknown>`), which is already persisted per-project by the content panel store:

```typescript
// Stored in tab.state
{
  showFileTree: boolean; // default: false
  diffStyle: "unified" | "split"; // default: "unified"
  category: "unstaged" | "staged" | "last-turn" | "branch"; // default: "unstaged"
}
```

These survive tab switches and app restarts automatically.

## Chat Checkpoint Integration

The primary entry point for "Last Turn" review. When an agent turn completes, the chat already renders a `Checkpoint` component (`ai-elements/checkpoint.tsx`). Add a **"Review changes"** `CheckpointTrigger` button that:

1. Opens the content panel (if collapsed)
2. Opens the "review" `ContentPanelView` tab
3. Sets the category `<Select>` to "Last Turn"

This is done via a custom event `neovate:open-review` with `detail: { category: "last-turn" }`, dispatched from the checkpoint button. The review view listens for this event and updates its state accordingly.

The button should only appear when there are actual file changes in the turn (check via `rewindFiles(dryRun: true)` stats already available from the result event, or lazily on first click).

## File Guards

Applied uniformly across all four categories:

- **Binary files** — detected via git's binary attribute or null bytes in content. Show "Binary file changed" placeholder instead of diff.
- **Large files (>1MB)** — skip diff rendering. Show "File too large to display diff" with an "Open in Editor" button that opens the file in the editor ContentPanelView.
- **High file count (100+)** — show a warning banner ("Showing N files — this may be slow"). All file sections start collapsed. Diffs only load when expanded (lazy loading handles the rest).

## Auto-Refresh

The review panel subscribes to agent `result` events via the existing `subscribe` stream. When a turn completes (`msg.type === "result"`), the panel auto-refreshes the current category's file list and diffs. This means the user sees updated diffs immediately after Claude finishes working — no manual refresh needed.

In `useReview.ts`:

- Subscribe to the agent event stream for the active session
- On `result` event, re-fetch file list + diffs for the active category
- Debounce to avoid rapid re-fetches if multiple events fire quickly

## Implementation Tasks

1. Create `renderer/src/hooks/useActiveSession.ts` — shared hook for cross-plugin session access
2. Add `branchFiles` + `branchFileDiff` to `shared/plugins/git/contract.ts` and implement in git router
3. Create `shared/plugins/review/contract.ts` — oRPC contract (lastTurnFiles, lastTurnDiff only)
4. Modify `SessionManager` — enable checkpointing, track user message UUIDs, `git stash create` pre-turn snapshot (fallback to HEAD), add `lastTurnFiles()` + `lastTurnDiff()` methods
5. Create `main/plugins/review/` — plugin + router (agent-specific endpoints only)
6. Create `renderer/src/plugins/review/` — plugin + view + hook + locales (lazy diff loading, file guards, `...` overflow menu, file tree sidebar, persisted UI state via Tab.state)
7. Register plugin in `main/index.ts` and `renderer/core/app.tsx`
8. Wire review contract into the main router (`src/main/router.ts`)
9. Add "Review changes" button to chat `Checkpoint` component — dispatches `neovate:open-review` event
