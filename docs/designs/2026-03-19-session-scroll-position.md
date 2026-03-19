# Save Scroll Position Per Session

## Problem

When switching between sessions, the scroll position resets to the bottom. Users lose their reading context in previous conversations.

## Requirements

- Restore exact scroll position when switching back to a session
- In-memory only (no disk persistence, lost on app quit)
- No change to existing behavior for new sessions (still scroll to bottom)

## Design

### Storage

Module-level `Map<string, number>` in `agent-chat.tsx` — maps `sessionId` to `scrollTop`. This is transient UI state that doesn't need Zustand or persistence.

### Save

Two mechanisms:

1. **Debounced on scroll** (~200ms) — continuously update the map as the user scrolls. Cheap writes to a module-level map.
   - When `isAtBottom === false`: save `scrollTop` to map.
   - When `isAtBottom === true`: **delete** the map entry — prevents restoring a stale "scrolled up" position after the user scrolled back to bottom.
2. **On unmount** — save as cleanup effect fallback (same `isAtBottom` guard: save or delete).

Access the scroll container through `StickToBottomContext.scrollRef` (already available via `conversationContextRef`).

### Restore

When `AgentChatSession` mounts:

1. Check if the map has a saved position for this `sessionId`
2. If **yes**: pass `initial={false}` to `Conversation` to suppress the auto-scroll-to-bottom, then set `scrollElement.scrollTop` in a `useLayoutEffect` (runs after DOM mutation but before browser paint — avoids a visual flash of the wrong scroll position)
3. If **no** (new/first visit): keep current behavior (`initial="smooth"`, scrolls to bottom)

### Invalidation

- **Session deleted**: remove map entry.
- **New messages on non-active session**: clear saved position so it scrolls to bottom when switched to. Subscribe to message count changes for non-active sessions in the store.

## Files Changed

| File                                                        | Change                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/renderer/src/features/agent/components/agent-chat.tsx` | Module-level map, save on unmount, restore on mount, conditional `initial` prop |

~20 lines of new code. No new files, no new dependencies.

## Edge Cases

- **Session with no messages**: `isNew` sessions show `WelcomePanel`, not `AgentChatSession`, so scroll position is irrelevant
- **New messages arrive while away**: Saved position cleared, scrolls to bottom to show new content
- **App restart**: Positions lost (by design), sessions load and scroll to bottom as they do today
