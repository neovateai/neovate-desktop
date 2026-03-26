# Large Diff Performance Fix for Changes Panel

## 1. Background

The Changes panel freezes the UI when expanding files with large diffs (e.g., package-lock.json). The `@pierre/diffs` library does diff computation (`parseDiffFromFile`) and syntax highlighting (Shiki) synchronously on the main thread. For files with 200KB+ combined content, this blocks the renderer process for seconds.

GitHub solves this by suppressing diffs for generated/lock files entirely, showing "Diff not rendered" with an opt-in link. We adopt a similar approach: detect known generated files, skip fetching their diff content, and show per-file diff stats (+N -M) so users still get useful info at zero rendering cost.

## 2. Requirements Summary

**Goal:** Prevent UI freezing when viewing large file diffs in the Changes panel, following GitHub's pattern of suppressing generated file diffs.

**Scope:**

- In scope: Changes panel, git router (diff stats), file list types
- Out of scope: Git diff view (`git-diff-view.tsx`), `.gitattributes` parsing (future enhancement), last-turn per-file stats

## 3. Acceptance Criteria

1. Known lock/generated files (package-lock.json, yarn.lock, etc.) show "Generated file — diff not shown" when expanded, without fetching diff content
2. Every file header shows `+N -M` diff stats (insertions/deletions) from `git diff --numstat`
3. A "Show diff" button on suppressed files lets users opt in to loading and rendering the diff
4. The 200KB soft threshold and 1MB hard limit remain as safety nets for non-generated large files
5. Existing small/medium diffs work exactly as before
6. `bun ready` passes

## 4. Problem Analysis

Current state: The Changes panel uses `MultiFileDiff` from `@pierre/diffs/react`. When a file is expanded, `loadDiff()` fetches full old+new file contents over IPC, then `parseDiffFromFile()` runs synchronously on the main thread. For large files (lock files), this freezes the UI.

Root cause chain:

1. `loadDiff()` transfers full file contents (2x file size) over IPC — wasteful for files we won't display
2. `parseDiffFromFile()` runs O(n\*m) diff algorithm synchronously on the main thread
3. No distinction between source code files and generated/lock files

GitHub's approach: detect generated files via `linguist-generated` in `.gitattributes` and/or filename patterns, suppress their diffs, show "Diff not rendered" with stats.

Approaches evaluated:

- **Approach A: `@pierre/diffs` WorkerPoolContextProvider** — only offloads syntax highlighting, NOT `parseDiffFromFile`. Marginal benefit, build complexity.
- **Approach B: Size threshold only** — catches large files after fetching, but still pays IPC cost and can't show stats.
- **Chosen approach: Generated file detection + diff stats + size threshold fallback** — prevents fetching AND rendering for known large files, shows useful stats, and keeps size thresholds as a safety net for unknown files.

## 5. Decision Log

**1. Where to detect generated files?**

- Options: A) Main process (can use `.gitattributes`) · B) Renderer (filename check)
- Decision: **B) Renderer** — simple filename match against a known list. No backend change needed for detection. `.gitattributes` support can be added later as an enhancement on the main process side.

**2. How to get per-file diff stats?**

- Options: A) Compute from full file contents in renderer · B) `git diff --numstat` in main process
- Decision: **B)** — `git diff --numstat` is a single fast git command that returns insertions/deletions for all files. Returns alongside the file list, no extra IPC round-trip per file. No file content transfer needed.

**3. Which categories get diff stats?**

- Decision: Unstaged (`git diff --numstat`), staged (`git diff --cached --numstat`), and branch (`git diff --numstat <mergeBase>`) get per-file stats. Last-turn category only has global stats from `RewindFilesResult` — per-file stats would require additional git commands in session-manager, deferred to future work.

**4. What files count as "generated"?**

- Decision: Exact filename match against a known list of lock files. No glob patterns (YAGNI). List:
  `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`, `composer.lock`, `go.sum`, `Pipfile.lock`, `pdm.lock`, `flake.lock`

**5. Should generated file detection completely block diff or just suppress by default?**

- Decision: Suppress by default with opt-in "Show diff" button. Same `forceShownFiles` mechanism as the size threshold. Clicking "Show diff" calls `loadDiff()` and renders normally (with the 200KB/1MB thresholds still active as safety nets).

**6. Should `loadDiff` be skipped entirely for generated files?**

- Decision: Yes. Currently `toggleFile()` calls `loadDiff()` immediately on expand. For generated files (when not in `forceShownFiles`), skip `loadDiff()`. This avoids the IPC cost of transferring large file contents that won't be rendered.

## 6. Design

### Guard Priority (updated)

```
generated && !forced? → "Generated file — diff not shown" + stats + [Show diff]
                        (loadDiff never called)
binary?              → "Binary file"
> 1MB?               → "File too large" (hard limit, no bypass)
> 200KB && !forced?  → "Large file" + [Show diff]
empty?               → "No changes"
else                 → render diff
```

### File Header with Stats

```
▶ package-lock.json  +1,234 -567  M
```

Stats are shown on all file headers when available, regardless of whether the diff is rendered.

### Backend: Add `--numstat` to file list responses

Add per-file `insertions` and `deletions` to `GitFile` and `GitBranchFile` types. Computed by running `git diff --numstat` alongside the existing `git status` / `git diff --name-status` calls.

**`getFiles()`** — add:

```typescript
const [numstatWorking, numstatStaged] = await Promise.all([
  gitClient.raw(["diff", "--numstat"]),
  gitClient.raw(["diff", "--cached", "--numstat"]),
]);
```

**`getBranchFiles()`** — change existing `git diff --name-status` to `git diff --name-status --numstat` or run a parallel `--numstat` call.

**Parse function:**

```typescript
function parseNumstat(output: string): Map<string, { insertions: number; deletions: number }> {
  const stats = new Map();
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [ins, del, ...parts] = line.split("\t");
    const file = parts.join("\t");
    if (!file || ins === "-") continue; // skip binary
    stats.set(file, { insertions: Number(ins), deletions: Number(del) });
  }
  return stats;
}
```

### Frontend: Generated file detection

Client-side filename check — no backend involvement:

```typescript
const GENERATED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
  "Pipfile.lock",
  "pdm.lock",
  "flake.lock",
]);

const isGenerated = (fileName: string) => GENERATED_FILES.has(fileName);
```

### Frontend: Skip `loadDiff` for generated files

Modify `toggleFile()`:

```typescript
const toggleFile = (file: ChangesFile) => {
  setExpandedFiles((prev) => {
    const next = new Set(prev);
    if (next.has(file.relPath)) {
      next.delete(file.relPath);
    } else {
      next.add(file.relPath);
      if (!isGenerated(file.fileName) || forceShownFiles.has(file.relPath)) {
        loadDiff(file.relPath);
      }
    }
    return next;
  });
};
```

### Frontend: "Show diff" on generated files triggers `loadDiff`

When user clicks "Show diff" on a generated file:

1. Add to `forceShownFiles`
2. Call `loadDiff(relPath)`
3. Diff renders through the normal pipeline (200KB/1MB guards still active)

### State (unchanged from v1)

- `forceShownFiles: Set<string>` — per-file bypass of both generated suppression and 200KB threshold
- Reset on category change
- NOT reset on refresh

## 7. Files Changed

**Contracts:**

- `src/shared/plugins/git/contract.ts` — Add `insertions?: number`, `deletions?: number` to `GitFile` and `GitBranchFile`

**Main process:**

- `src/main/plugins/git/router.ts` — Add `parseNumstat()` helper, run `git diff --numstat` in `getFiles()` and `getBranchFiles()`, merge stats into file objects

**Renderer:**

- `src/renderer/src/plugins/changes/hooks/useChanges.ts` — Add `insertions?`, `deletions?` to `ChangesFile`, propagate from responses
- `src/renderer/src/plugins/changes/changes-view.tsx` — Add `GENERATED_FILES` set, `isGenerated()`, modify `toggleFile()` to skip `loadDiff`, show generated file message, show stats on file headers
- `src/renderer/src/plugins/changes/locales/en-US.json` — Add `review.generatedFile`
- `src/renderer/src/plugins/changes/locales/zh-CN.json` — Add Chinese translation

## 8. Verification

1. [AC1] Expand `package-lock.json` — shows "Generated file — diff not shown" + stats, NO IPC call, no freeze
2. [AC2] File headers show `+N -M` stats for unstaged, staged, and branch categories
3. [AC3] Click "Show diff" on a generated file — fetches and renders the diff (with size guards active)
4. [AC4] Expand a normal code file — renders diff immediately, no warning
5. [AC5] Files over 200KB (non-generated) still show "Large file" warning with "Show diff"
6. [AC6] Files over 1MB still show "File too large" with no bypass
7. [AC7] `bun ready` passes
