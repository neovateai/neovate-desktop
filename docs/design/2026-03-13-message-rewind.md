# Message Rewind (Conversation + File)

## Overview

Allow users to rewind conversation and code to any previous user message. A rewind icon appears below each user message on hover. Clicking it opens a popover with restore options. Aligned with Claude Code's rewind behavior.

## UX Flow

1. User hovers over a user message block, a rewind icon fades in below the message bubble (hidden by default, visible on hover via opacity transition)
2. User clicks the rewind icon
3. Popover opens, immediately showing "Restore conversation only" option
4. In parallel, a dry-run call fetches file change info (spinner while loading)
5. Once loaded, "Restore code and conversation" option appears with summary (e.g. "3 files changed +42 -17")
6. User picks an option
7. Rewind executes, messages are removed, input box is pre-filled with the rewound message's text content (images/attachments are dropped — only text is restored)
8. Toast appears: "Conversation rewound - Undo" with ~10s timeout

## Restore Options (popover)

- **Restore code and conversation** - rewind files via SDK + truncate messages (only shown when file changes exist)
- **Restore conversation only** - truncate messages, leave files as-is

"Restore code only" is intentionally excluded — it creates a confusing state where messages reference code changes that no longer exist.

## Constraints

- **Disabled during streaming** - rewind buttons are disabled while the agent is actively streaming a response
- **Abort before rewind** - if the agent has a queued/in-progress turn (e.g. waiting for tool permission), abort it before rewinding
- **Undo safety net** - removed messages stored in temporary `rewindUndoBuffer` in the Zustand store; toast with "Undo" option for ~10s; buffer cleared after timeout or on next user action
- **Double rewind** - if user rewinds again before the undo toast expires, dismiss the previous toast, discard the old undo buffer, and replace with the new one (accept data loss — user is intentionally rewinding further)
- **Clear on session switch** - clear `rewindUndoBuffer` and dismiss undo toast when user switches to a different session tab
- **Non-text content** - when pre-filling input after rewind, only restore text content; images and file attachments are dropped (not re-inserted into the editor)

## Data Flow

```
User clicks rewind icon on message X
  |
  v
Frontend calls backend: rewindFilesDryRun(sessionId, messageId)
  -> SDK rewindFiles(messageId, {dryRun: true})
  -> Returns { canRewind, filesChanged, insertions, deletions }
  |
  v
Popover renders options:
  - "Restore conversation only" (always available, shown immediately)
  - "Restore code and conversation" (shown after dry-run, only if canRewind && filesChanged.length > 0)
  |
  v
User picks an option
  |
  v
If file restore selected:
  Frontend calls backend: rewindFiles(sessionId, messageId)
  -> SDK rewindFiles(messageId, {dryRun: false})
  |
  v
Conversation restore (always):
  1. Abort any in-progress agent turn
  2. If rewindUndoBuffer exists, dismiss previous undo toast and discard old buffer
  3. Store removed messages in rewindUndoBuffer
  4. Slice messages array: remove messageX and everything after it
  5. Pre-fill input box with messageX text content only (drop images/attachments)
  6. Show undo toast (~10s timeout)
  |
  v
Done
```

## Contract Changes (shared/features/agent/contract.ts)

Add two methods to the agent router:

```typescript
rewindFilesDryRun: {
  input: {
    sessionId: string;
    messageId: string;
  }
  output: RewindFilesResult; // { canRewind, filesChanged?, insertions?, deletions?, error? }
}

rewindFiles: {
  input: {
    sessionId: string;
    messageId: string;
  }
  output: RewindFilesResult;
}
```

Reuse existing `RewindFilesResult` type from the review plugin.

## Backend Changes (main/features/agent/session-manager.ts)

Two new handlers delegating to the SDK:

- `rewindFilesDryRun` -> `session.query.rewindFiles(messageId, { dryRun: true })`
- `rewindFiles` -> `session.query.rewindFiles(messageId, { dryRun: false })`

## Frontend Store Changes (renderer/src/features/agent/store.ts)

New state and actions:

```typescript
// State
rewindUndoBuffer: { sessionId: string; messages: ChatMessage[] } | null

// Actions
rewindToMessage(sessionId: string, messageId: string): void
  // 1. Find message index
  // 2. Store messages[index..] in rewindUndoBuffer
  // 3. Slice messages to messages[0..index]
  // 4. Return the rewound message content for input pre-fill

undoRewind(): void
  // Restore messages from rewindUndoBuffer, clear buffer

clearRewindBuffer(): void
  // Called on timeout or next user action
```

## UI Changes

### New component: MessageRewindButton

Rendered below each user message in message-parts.tsx.

- Rewind icon (RotateCcw from lucide-react)
- Hidden by default, fades in on hover of the parent message block (opacity-0 -> opacity-100 transition)
- Click opens Radix Popover with restore options
- Calls dry-run on popover open to populate file change summary
- Shows spinner while dry-run is loading
- Disabled when agent is streaming

### Modified: agent-chat.tsx / message input

- After rewind, pre-fill input with rewound message's text content only (drop images/attachments)
- On next user message submission, clear rewindUndoBuffer
- On session switch, clear rewindUndoBuffer and dismiss undo toast

### New: Undo toast

- Shown after rewind with "Undo" action button
- ~10s auto-dismiss timeout
- Clicking "Undo" calls undoRewind() and dismisses toast

## Persistence

No `.jsonl` modifications. The SDK handles message continuity naturally when the next message is sent from the rewound point.

## Files to Modify

| File                                                            | Change                                            |
| --------------------------------------------------------------- | ------------------------------------------------- |
| `shared/features/agent/contract.ts`                             | Add rewindFilesDryRun, rewindFiles methods        |
| `main/features/agent/session-manager.ts`                        | Implement the two new handlers                    |
| `renderer/src/features/agent/store.ts`                          | Add rewindToMessage, undoRewind, rewindUndoBuffer |
| `renderer/src/features/agent/components/message-parts.tsx`      | Render MessageRewindButton below user messages    |
| `renderer/src/features/agent/components/agent-chat.tsx`         | Pre-fill input on rewind, clear buffer on submit  |
| `renderer/src/components/ai-elements/message-rewind-button.tsx` | New component: icon + popover                     |
