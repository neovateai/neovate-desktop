# Review Panel: Include Uncommitted Changes in Branch Diff

## Problem

The review panel's "branch" category only compared committed state (`HEAD`) against the tracking branch using `git diff --name-status ${tracking}...HEAD`. When the local and remote branches pointed to the same commit, the diff was empty even though there were uncommitted working tree changes.

Users expect the branch review to show the **full picture**: all changes (committed + uncommitted) relative to the upstream branch.

## Solution

Use the **merge-base** of the tracking branch and HEAD as the comparison baseline, and diff against the **working tree** instead of HEAD.

### Changes

**File:** `packages/desktop/src/main/plugins/git/router.ts`

#### `getBranchFiles()`

- Compute merge-base: `git merge-base ${tracking} HEAD`
- Changed file list command from `git diff --name-status ${tracking}...HEAD` to `git diff --name-status ${mergeBase}`
- This compares the fork point against the working tree, capturing both committed and uncommitted changes

#### `getBranchFileDiff()`

- Compute merge-base (same as above)
- `oldContent`: changed from `${tracking}:${file}` to `${mergeBase}:${file}`
- `newContent`: changed from `git show HEAD:${file}` to `fs.readFileSync(path.resolve(cwd, file))` (reads working tree)

### Why merge-base instead of tracking directly

Using `git diff ${tracking}` (without merge-base) breaks when the tracking branch has diverged (behind > 0). Upstream-only commits would appear as "removed" changes, which is misleading.

The merge-base approach shows "everything this branch changed since it forked from upstream, including uncommitted work" -- essentially a PR preview plus working tree state.

### Fallback

Both functions fall back to using the tracking ref directly if `git merge-base` fails.
