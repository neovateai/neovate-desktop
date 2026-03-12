# Session Completed Indicator

## Problem

When a session completes a turn (user sent message -> agent finishes responding) while the user is focused on a different session, there is no visual indication that the background session has finished. The user has to manually check each session.

## Requirements

- **Trigger**: Show indicator when a session's turn completes (streaming/submitted -> ready/error) while the session is NOT the active/focused session
- **Visual**: A small colored dot replacing the left icon (comment icon) in the session list item — green for success, red for error
- **Clear**: The indicator disappears when the user clicks on/opens the session (it becomes the active session)

## Approach: Track in Zustand agent store

The agent store already owns `activeSessionId` and session lifecycle, making it the natural place to track "completed but unseen" sessions.

### Data changes — `agent/store.ts`

- Add `unseenTurnResults: Map<string, "success" | "error">` to `AgentState`
- Add `markTurnCompleted(sessionId: string, result: "success" | "error")` action — sets the entry
- Add `clearTurnResult(sessionId: string)` action — deletes the entry
- Modify `setActiveSession(id)` — deletes `id` from `unseenTurnResults` when the user switches to it
- Modify `removeSession(id)` — deletes `id` from `unseenTurnResults` to prevent stale entries
- Note: archiving via `ProjectStore.archiveSession` also calls `removeSession` when the session is active, so archived sessions are cleaned up transitively
- Note: `completedSessions` was renamed to `unseenTurnResults` to avoid confusion with session lifecycle ("session is completed/finished forever" vs "a turn finished and hasn't been seen")

### Status detection — `ClaudeCodeChat` via callback

Detection lives in the chat layer, NOT in React components. This avoids missed transitions if the session-list component unmounts/remounts (e.g. virtualization, sidebar collapse).

`ClaudeCodeChatState` is a generic state container with no `sessionId` — it cannot call into the store directly. Instead, detection is wired through `ClaudeCodeChat` (which owns `this.id`) using a callback pattern to avoid tight coupling between the chat layer and the agent store:

- `ClaudeCodeChatState` tracks `previousStatus` internally. When the `status` setter is called, it stores the old value before updating.
- `ClaudeCodeChat` constructor accepts an optional callback:
  ```ts
  onTurnComplete?: (sessionId: string, result: "success" | "error") => void
  onTurnStart?: (sessionId: string) => void
  ```
- `ClaudeCodeChat` subscribes to its own `store` and checks for qualifying transitions. It tracks `previousStatus` via a closed-over `let prev` variable in the subscription callback (no need to add `previousStatus` to `ClaudeCodeChatStoreState`):
  - `streaming -> ready` — fires `onTurnComplete` with `"success"`
  - `streaming -> error` — fires `onTurnComplete` with `"error"`
  - `submitted -> error` — fires `onTurnComplete` with `"error"` (network failure before streaming started; the user submitted a turn and it failed, they should know)
  - `* -> submitted` or `* -> streaming` — fires `onTurnStart` (clears any stale unseen result if a new turn begins before the user views the previous one)
- Explicitly ignored for `onTurnComplete`: `submitted -> ready` (cancelled before streaming), `ready -> ready` (no-op), and other non-streaming/non-submitted transitions
- `ClaudeCodeChatManager` wires the callbacks when creating/loading a chat:
  ```ts
  const chat = new ClaudeCodeChat({
    id: sessionId,
    transport: this.transport,
    onTurnComplete: (id, result) => {
      const { activeSessionId, markTurnCompleted } = useAgentStore.getState();
      if (activeSessionId !== id) markTurnCompleted(id, result);
    },
    onTurnStart: (id) => {
      useAgentStore.getState().clearTurnResult(id);
    },
  });
  ```

### Wiring — `unified-session-item.tsx`

- No transition detection needed here (handled in chat layer)
- Read `turnResult` from `unseenTurnResults` in the agent store and pass it to `SessionItem`

### Visual — `session-item.tsx`

- Add `turnResult?: "success" | "error"` prop
- In the icon priority chain, insert after processing, before pinned/comment:
  ```
  pendingPermission -> processing -> completed (green/red dot) -> pinned -> comment
  ```
- Success: small filled circle with `text-green-500` (or `text-success`)
- Error: small filled circle with `text-destructive`

### Flow

```
Turn completes (streaming -> ready)
  -> ClaudeCodeChat store subscription detects streaming -> ready
  -> onTurnComplete callback checks activeSessionId !== sessionId
  -> calls markTurnCompleted(sessionId, "success")
  -> session-item renders green dot instead of comment icon

Turn errors (streaming -> error OR submitted -> error)
  -> same flow, but markTurnCompleted(sessionId, "error")
  -> session-item renders red dot

New turn starts (* -> submitted/streaming)
  -> onTurnStart callback calls clearTurnResult(sessionId)
  -> stale dot disappears, spinner takes over

User clicks session
  -> setActiveSession(id) deletes from unseenTurnResults
  -> dot disappears, shows normal icon

Session removed/archived
  -> removeSession(id) deletes from unseenTurnResults
  -> no stale entries
```
