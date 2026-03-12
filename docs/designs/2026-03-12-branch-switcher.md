# Branch Switcher

## Summary

Add a git branch switcher below the message input area, with a popover for branch list/search and a modal dialog for creating new branches.

## Placement

Below the message input container as a separate bar:

```
+-----------------------------------+
|  Type a message...                |
|-----------------------------------|
| [clip] [model] [perm]         [>] |
+-----------------------------------+
  [branch-icon] main v

Detached HEAD state:
  [branch-icon] HEAD (abc1234) v
```

## Architecture

3 layers:

### 1. Backend (main process)

New git branch ORPC handlers in `main/plugins/git/router.ts` using `simple-git`:

- `git.branches` - list local branches + current branch (capped at 50 most recent; search queries the full list on backend)
- `git.checkoutBranch` - switch branch (with named auto-stash if dirty)
- `git.createBranch` - create + checkout new branch (no stash needed — same commit as HEAD)

### 2. Contract (shared)

New types and ORPC contract entries in `shared/plugins/git/contract.ts`:

```typescript
interface GitBranch {
  name: string;
  current: boolean;
  tracking?: string; // e.g. "origin/main"
  ahead?: number; // commits ahead of remote
  behind?: number; // commits behind remote
  lastCommitTimestamp?: number; // for recent-first sorting
}

interface GitBranchesResponse {
  success: boolean;
  data?: {
    current: string; // branch name, or null if detached HEAD
    detachedHead?: string; // short commit hash when in detached HEAD state
    branches: GitBranch[];
  };
  error?: string;
}

interface GitCheckoutBranchResponse {
  success: boolean;
  data?: { stashed: boolean; stashPopFailed?: boolean };
  error?: string;
}

interface GitCreateBranchResponse {
  success: boolean;
  data?: { name: string };
  error?: string;
}
```

Contract additions:

```typescript
branches: oc.input(type<{ cwd: string; search?: string; limit?: number }>()).output(type<GitBranchesResponse>()),
checkoutBranch: oc.input(type<{ cwd: string; branch: string }>()).output(type<GitCheckoutBranchResponse>()),
createBranch: oc.input(type<{ cwd: string; name: string }>()).output(type<GitCreateBranchResponse>()),
```

### 3. Frontend (renderer)

Two new components:

| Component            | File                                                 | Description                                        |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `BranchSwitcher`     | `features/agent/components/branch-switcher.tsx`      | Trigger button + popover with branch list & search |
| `CreateBranchDialog` | `features/agent/components/create-branch-dialog.tsx` | Modal dialog for creating new branch               |

## UI Flow

### Branch Popover (opens upward from trigger)

```
+-------------------------------------+
| Search branches...                  |
|-------------------------------------|
| Recent                              |
|   * main                    up2 dn1 |
|     feat/login              up0 dn3 |
|-------------------------------------|
| All branches                        |
|     develop                         |
|     feat/some-feature               |
|     fix/typo                        |
|-------------------------------------|
| + Create new branch...              |
+-------------------------------------+
```

- Branches sorted by most recently checked out (via git reflog) in the "Recent" section (top 5)
- Remaining branches listed alphabetically under "All branches"
- Remote tracking info shown as `up N dn N` (ahead/behind) when available
- Search filters across both sections
- Loading spinner shown while fetching branches
- Inline error message if git call fails
- Full keyboard navigation:
  - Arrow Up/Down to move through the branch list
  - Enter to checkout the highlighted branch
  - Escape to close the popover
  - Search input is auto-focused on open, typing immediately filters
  - Tab moves focus from search input into the branch list

### Create Branch Dialog (modal)

```
+-------------------------------+
| Create New Branch             |
|                               |
| Branch name:                  |
| [neovate/                   ] |
| (invalid char error here)     |
|                               |
| From current branch (main)    |
|                               |
|          [Cancel] [Create]    |
+-------------------------------+
```

- Default branch name prefix: `neovate/` (pre-filled but fully editable -- user can clear it or type `fix/`, `feat/`, etc.)
- Always branches from current branch (no base branch selector -- YAGNI)
- Real-time client-side validation using git ref format rules:
  - No spaces, `..`, `~`, `^`, `:`, `\`, `?`, `*`, `[`
  - Cannot end with `.lock`, `/`, or `.`
  - Cannot start with `-` or `.`
  - Show inline validation error as user types
- Create button disabled when name is empty or invalid

## Data Flow

1. `BranchSwitcher` popover opens -> calls `client.git.branches({ cwd, limit: 50 })` (fetched on every open, not on mount, to avoid stale data)
2. User types in search -> debounced call to `client.git.branches({ cwd, search: query })` (backend filters full branch list, returns matches)
3. User clicks branch -> switcher enters loading state (disabled) -> calls `client.git.checkoutBranch({ cwd, branch })`
4. Backend: checks dirty state -> `git stash push -m "neovate-auto-stash: switching to <branch>"` if needed -> checkout -> pop stash -> returns result
5. On success -> emits `neovate:branch-changed` event so file tree and git sidebar can refresh
6. User clicks "Create new branch" -> opens `CreateBranchDialog`
7. Dialog submit -> calls `client.git.createBranch({ cwd, name })` (no stash needed) -> emits `neovate:branch-changed` -> refreshes list

## Edge Cases

### Dirty working tree

Named auto-stash before checkout (`git stash push -m "neovate-auto-stash: switching to <branch>"`), auto-pop after. Using a named stash avoids confusion with user's manual stashes. If stash pop fails (conflict), show a prominent warning (not just a toast) with the message "Stash pop failed due to conflicts. Your changes are saved in `git stash`. Run `git stash pop` to recover." Leave the stash intact so nothing is lost.

### Not a git repo

Hide the branch switcher entirely. Detect via `branches` returning an error.

### Branch name already exists

Backend returns error, displayed inline in the create dialog.

### Empty or invalid branch name

Real-time client-side validation (see Create Branch Dialog above). Disable the Create button until the name is valid.

### Mid-streaming

Disable branch switching while Claude is streaming (consistent with model/permission selectors).

### Session handling

Keep the current session intact after branch switch. The user can inform Claude about the context change if needed.

### Popover loading and error states

Show a small spinner inside the popover while branches are loading. If the git call fails, show an inline error message with a retry link instead of a blank popover.

### Detached HEAD state

When HEAD is detached (e.g., checked out a specific commit or tag), the trigger button shows `HEAD (abc1234)` instead of a branch name. The popover still works normally — user can switch to any named branch.

### Checkout in progress

While a checkout operation is running (stash + switch + pop can take seconds), the switcher shows a loading spinner and is disabled to prevent double-triggers.

### Create branch does not need stashing

Creating a new branch from current HEAD starts at the same commit — the working tree is unchanged. Skip stash logic entirely for `createBranch`.

### File tree and git sidebar refresh

After any branch switch or creation, emit a `neovate:branch-changed` custom event on `window`. The file tree plugin and git sidebar should listen for this event and refresh their data.

### Large repos (500+ branches)

Initial fetch is capped at 50 most recent branches. When the user types in the search input, the query is sent to the backend which filters the full branch list and returns matches. This keeps the popover responsive without loading hundreds of entries upfront.

### Git operation timeout

All backend git operations (`branches`, `checkoutBranch`, `createBranch`) have a 10-second timeout. On timeout, abort the operation and return `{ success: false, error: "Git operation timed out" }`. This prevents the UI from hanging permanently on slow filesystems (network mounts, large monorepos). The frontend shows the error inline and re-enables the switcher.

## Existing Patterns Used

- `Popover` from `components/ui/popover.tsx`
- `Dialog` from `components/ui/dialog.tsx`
- `Input` from `components/ui/input.tsx`
- ORPC contract/router pattern from existing git plugin
- `simple-git` for backend git operations
- Styling consistent with `InputToolbar` buttons
