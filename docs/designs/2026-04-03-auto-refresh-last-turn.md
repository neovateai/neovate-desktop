# Auto-refresh on Turn Activity

## Problem

1. The Changes panel's "Last Turn" category only refreshes on manual Cmd+R or when the category/project changes. While the agent is actively making file changes, users must keep manually refreshing. The empty state even tells users "Press ⌘R to refresh."
2. The `BranchSwitcher` (below the chat input) fetches the current branch once on mount. If the agent creates or switches branches during a turn, the displayed branch name goes stale until the user opens the popover.

## Design

### Approach

Two mechanisms, one shared event:

1. **Polling in `useChanges` hook** — 2s interval during active streaming for the "Last Turn" category
2. **`neovate:turn-completed` event** — a general-purpose CustomEvent dispatched from `chat-manager.ts` when any turn finishes. Any component can listen to it. Two consumers:
   - `useChanges` — final refresh of the current category (all categories are stale after a turn: agent writes files → unstaged, may stage → staged, may commit → branch, always → last-turn)
   - `BranchSwitcher` — re-fetch current branch name

**How it works:**

1. `useChanges()` accepts an optional `shouldPoll` boolean parameter
2. The view computes `shouldPoll = isStreaming && isActive && !panelCollapsed` — the hook doesn't need to know why
3. When `category === "last-turn"` AND `shouldPoll === true`, start a 2-second `setInterval` that calls `refresh()`
4. The `"neovate:turn-completed"` event triggers one final refresh in `useChanges` and a branch re-fetch in `BranchSwitcher`

### Data flow

```
chat-manager.ts
  └── onTurnComplete callback
        → window.dispatchEvent(new CustomEvent("neovate:turn-completed", { detail: { sessionId } }))

changes-view.tsx                                  branch-switcher.tsx
  ├── useActiveSession() → sessionId                ├── useEffect: listen "neovate:turn-completed"
  ├── useSessionChatStatus(sessionId)               │     → re-fetch client.git.branches({ cwd, limit: 1 })
  ├── useContentPanelViewContext() → { isActive }   │     → update currentBranch / detachedHead
  ├── layoutStore → panelCollapsed                  └── (no session ID check needed — only one
  ├── shouldPoll = isStreaming && isActive               visible at a time for the active session)
  │                 && !panelCollapsed
  └── useChanges(category, { shouldPoll })
        ├── useEffect (polling):
        │     when category === "last-turn" && shouldPoll
        │     → setInterval(refresh, 2000) with in-flight guard
        │     → cleanup: clearInterval
        └── useEffect (turn-completed event):
              listen for "neovate:turn-completed"
              → if detail.sessionId === sessionId
              → call refresh() once (any category — all are stale after a turn)
```

### Files to change

1. **`src/renderer/src/plugins/changes/hooks/useChanges.ts`**
   - Add `shouldPoll?: boolean` to function signature (or an options object). `sessionId` is already available internally via `useActiveSession()`
   - Add a polling `useEffect`:
     - Starts a 2s `setInterval` when `category === "last-turn"` AND `shouldPoll`
     - Each tick checks an `isRefreshingRef` — if a refresh is already in-flight, skip the tick
     - Cleanup clears the interval
   - Add a turn-completed `useEffect`:
     - Listens for the `"neovate:turn-completed"` CustomEvent on `window`
     - When fired, checks `detail.sessionId` matches the hook's internal `sessionId` (from `useActiveSession()`) before calling `refresh()`
     - No category guard — all categories are stale after a turn (agent writes files → unstaged, may stage → staged, may commit → branch)
     - More precise than ref-tracking the `isStreaming` transition — no risk of missing or double-firing

2. **`src/renderer/src/plugins/changes/changes-view.tsx`**
   - Import `useSessionChatStatus` from `../../features/agent/hooks/use-session-chat-status`
   - Import `layoutStore` from `../../components/app-layout/store`
   - Get `{ isStreaming }` for the active session's `sessionId`
   - Get `{ isActive }` from `useContentPanelViewContext()` (already imported)
   - Get `panelCollapsed` from `layoutStore`
   - Compute `shouldPoll = isStreaming && isActive && !panelCollapsed`
   - Pass to `useChanges(category, { shouldPoll })`

3. **`src/renderer/src/features/agent/chat-manager.ts`**
   - In the `onTurnComplete` callback, dispatch a `"neovate:turn-completed"` CustomEvent with `{ detail: { sessionId } }`
   - Dispatch unconditionally (before the `activeSessionId !== id` guard) so both active and background sessions emit it
   - Same pattern already used by `"neovate:open-changes"`

4. **`src/renderer/src/features/agent/components/branch-switcher.tsx`**
   - Add a `useEffect` that listens for `"neovate:turn-completed"` on `window`
   - When fired, re-fetch `client.git.branches({ cwd, limit: 1 })` and update `currentBranch` / `detachedHead`
   - No session ID matching needed — only one BranchSwitcher is visible at a time (for the active session's `cwd`)

### Edge cases

- **No session:** `isStreaming` is `false` → `shouldPoll` is `false` → no polling
- **Category not "last-turn":** Polling doesn't start regardless of `shouldPoll`
- **Changes tab not active:** `isActive` is `false` → `shouldPoll` is `false` → no polling
- **Content panel collapsed:** `panelCollapsed` is `true` → `shouldPoll` is `false` → no polling
- **Refresh already in-flight:** Polling tick is skipped via `isRefreshingRef` guard — prevents stacking requests in large repos where git operations take >2s
- **Background session completes:** Turn-completed listener checks `detail.sessionId === sessionId` — only refreshes for the active session
- **Turn completes while on any category:** Refresh fires unconditionally — all categories benefit (unstaged/staged/branch/last-turn)
- **Rapid category switching:** The existing `fetchIdRef` pattern in `refresh()` already handles stale updates
- **BranchSwitcher unmounted:** Cleanup removes the event listener — no stale fetches
- **Agent doesn't change branch:** Re-fetch is cheap (limit: 1) and idempotent — `currentBranch` stays the same
