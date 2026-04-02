# Fix: New sessions missing from Cmd+K palette

## Problem

Sessions that have messages (user chatted in them) don't appear in Cmd+K's session list or search results.

### Root Cause

Two interacting bugs in the command palette's session data pipeline:

1. **`agentSessions` is a stale snapshot** — Populated once via `client.agent.listSessions()` on project switch (`agent-chat.tsx:133-137`). New sessions created afterward are never added. They only exist in the in-memory `sessions` Map.

2. **New sessions are appended last in `sessionItems`, then sliced off by `MAX_SESSIONS`** — In `use-command-registry.ts`, `sessionItems` is built in two loops: first from `agentSessions` (persisted), then from in-memory `sessions`. New sessions end up at the end. The command palette's `sessionItems.filter(matchItem).slice(0, MAX_SESSIONS)` (MAX=10) cuts them off before sorting.

### Why the sidebar works

The sidebar (`use-unified-sessions.ts`) combines both sources and sorts by date after merging, with no cap. New sessions sort to the top.

## Design

### Change 1: Store — Add new session to `agentSessions` on first message

**File:** `packages/desktop/src/renderer/src/features/agent/store.ts`
**Location:** `addUserMessage` action, after `session.isNew = false` (line 236)

When a session transitions from `isNew: true` to `false`, prepend a `SessionInfo` entry to `agentSessions` with a dedup guard:

```ts
if (wasNew && !state.agentSessions.some((s) => s.sessionId === sessionId)) {
  state.agentSessions.unshift({
    sessionId,
    title: session.title,
    cwd: session.cwd,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  });
}
```

### Change 2: Registry — Sort `sessionItems` by recency (`updatedAt` preferred)

**File:** `packages/desktop/src/renderer/src/features/command-palette/use-command-registry.ts`
**Location:** End of `sessionItems` `useMemo`, before `return items`

Build a `sortKeyMap` during iteration. Use `updatedAt` for `agentSessions` entries (sessions the user has been actively chatting in rank higher) and fall back to `createdAt` for in-memory sessions (which don't track `updatedAt`). This matches sidebar behavior.

```ts
const sortKeyMap = new Map<string, string>();

// In first loop (agentSessions), after pushing item:
sortKeyMap.set(info.sessionId, info.updatedAt);

// In second loop (in-memory sessions), after pushing item:
sortKeyMap.set(session.sessionId, session.createdAt);

// After both loops:
items.sort((a, b) => {
  const idA = a.id.replace("session:", "");
  const idB = b.id.replace("session:", "");
  const timeA = sortKeyMap.get(idA) ?? "";
  const timeB = sortKeyMap.get(idB) ?? "";
  return timeB.localeCompare(timeA); // newest first
});
```

### Change 3: Palette — Uncap search + explicit timestamp sort for sessions

**File:** `packages/desktop/src/renderer/src/features/command-palette/command-palette.tsx`

**3a. Remove `MAX_SESSIONS` cap during active search** (line 75)

When the user is searching, show all matching sessions instead of capping at 10. Empty query keeps the cap for a clean default view.

```ts
const limit = searchQuery ? sessionItems.length : MAX_SESSIONS;
const matchedSessions = sessionItems.filter(matchItem).slice(0, limit);
```

**3b. Explicit timestamp sort for sessions** (lines 81-87)

Don't rely on stable sort preserving upstream order. Use the `sessionItems` array index as an explicit sort key — `sessionItems` is already sorted by recency from Change 2, and `indexOf` preserves that rank:

```ts
items.sort((a, b) => {
  // Sessions before commands
  if (a.group !== b.group) {
    return a.group === "session" ? -1 : 1;
  }
  // Within sessions: preserve recency order from sessionItems
  if (a.group === "session") {
    return sessionItems.indexOf(a) - sessionItems.indexOf(b);
  }
  // Within commands: sort by frecency
  return getFrecencyScore(b.id) - getFrecencyScore(a.id);
});
```

## Files Changed

| File                      | Change                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `store.ts`                | In `addUserMessage`, prepend `SessionInfo` to `agentSessions` when `wasNew` (with dedup) |
| `use-command-registry.ts` | Sort `sessionItems` by `updatedAt`/`createdAt` descending using a `sortKeyMap`           |
| `command-palette.tsx`     | Uncap `MAX_SESSIONS` during search; explicit session order in sort comparator            |

~20 lines of logic. No type changes, no new dependencies, no API changes.
