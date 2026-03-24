# Changes Panel: Show Relative File Paths

## 1. Background

The Changes panel displays file paths that may be absolute (especially from the SDK's `rewindFiles` for the "last-turn" category). Users want shorter, relative paths for readability.

## 2. Decision Log

**1. Where to strip the prefix?**

- Options: A) `useChanges` hook · B) `changes-view.tsx` display only
- Decision: **A) Hook** — `relPath` is used as both display and API key. Making it relative at the source keeps everything consistent. The `lastTurnDiff` backend uses `path.resolve(cwd, file)` which handles relative paths correctly.

**2. Which categories need fixing?**

- Options: A) All · B) Only `last-turn`
- Decision: **B) Only `last-turn`** — `unstaged`/`staged`/`branch` already return git-root-relative paths from `simple-git`.

## 3. Design

In `useChanges.ts`, when mapping `res.filesChanged` for the `last-turn` category, strip the `cwd` prefix from any absolute path before storing as `relPath`.

## 4. Files Changed

- `packages/desktop/src/renderer/src/plugins/changes/hooks/useChanges.ts` — strip cwd prefix from last-turn file paths

## 5. Verification

1. Open Changes panel → select "Last Turn" category
2. File paths should show as relative (e.g., `src/main/foo.ts` not `/Users/.../src/main/foo.ts`)
3. Clicking a file should still load the diff correctly
