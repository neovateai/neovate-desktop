# Message Rewind v2 (Thin SDK Wrapper)

## Overview

Allow users to rewind conversation and code to any previous user message. A rewind icon appears on each user message on hover. Clicking opens a popover with restore options. File restoration is fully delegated to the SDK's built-in checkpointing. Old conversation branches are implicitly preserved in the `.jsonl` session file for a future timeline UI.

## Design Decisions

- **Approach A (Thin Wrapper)**: Minimal custom logic. SDK handles all file checkpointing and restoration via `query.rewindFiles(messageId, opts)`. We add a thin coordination layer.
- **UX entry**: Inline per-message rewind icons (hover-reveal)
- **Snapshot engine**: SDK-managed (`enableFileCheckpointing: true`)
- **Branching**: Implicit — truncate visually, persist old branch in `.jsonl` for future timeline
- **Safety**: Undo toast (~10s), execute immediately

## SDK Investigation Findings

The SDK separates concerns sharply:

- **`query.rewindFiles(messageId, { dryRun })`** — restores files ONLY. Does NOT truncate conversation history. The SDK's in-memory message list remains unchanged after calling this.
- **`forkSession(sessionId, { upToMessageId, dir, title })`** — standalone function (not a Query method). Creates a new session with messages up to `upToMessageId` (inclusive). Remaps all message UUIDs. The forked session is resumable via `loadSession()`.
- **No `rewindConversation()` method exists.** Claude Code handles conversation truncation at the REPL level by slicing its own message array and resetting the conversation ID.
- **Forked sessions lose file-history snapshots** — file checkpointing starts fresh in the fork. This means a forked session cannot rewind files to points before the fork. Subsequent turns will create new checkpoints normally.

**Implication**: After calling `rewindFiles()` alone, the next message sent to the SDK would include the full original conversation as context — including messages the user thinks were removed. To truly truncate conversation state, we MUST use `forkSession()` to create a new session with the correct message history.

**`upToMessageId` is inclusive**: `forkSession({ upToMessageId: X })` includes message X in the fork. Since we want to remove X and everything after it (so the user can re-type X), we need the ID of the message immediately BEFORE X. **This resolution happens on the backend** — the backend reads the `.jsonl` transcript to find the previous message. The renderer only sends the target `messageId`; it doesn't need to know about `prevMessageId`. This avoids surfacing SDK UUIDs for assistant messages (we only surface them for user messages). For the first-message case (no prior message), the backend creates a fresh session instead of forking.

## Architecture

```
+-- Renderer ---------------------------------------------------+
|  MessageRewindButton (per user message, hover-reveal)         |
|       |                                                       |
|       +-- onClick -> popover with restore options             |
|       |    +-- dry-run call -> show file change summary       |
|       |    +-- user picks option                              |
|       |                                                       |
|  AgentStore                                                   |
|       +-- rewindUndoBuffer (originalSessionId for undo)       |
|                                                               |
|  ChatManager                                                  |
|       +-- rewindToMessage() -> orchestrates fork + switch     |
|       +-- undoRewind() -> switch back to original session     |
|       +-- clearRewindBuffer() -> close original session       |
|                                                               |
|  AgentChat                                                    |
|       +-- pre-fill input after rewind                         |
|       +-- clear buffer on next send / session switch          |
+---------------------------------------------------------------+
           | oRPC
+-- Main -------------------------------------------------------+
|  SessionManager                                               |
|       +-- rewindFilesDryRun(sid, msgId)                       |
|       |    -> query.rewindFiles(msgId, {dryRun: true})        |
|       +-- rewindToMessage(sid, msgId, restoreFiles)           |
|       |    -> rewindFiles() if requested                      |
|       |    -> findPrevMessageId() from .jsonl transcript      |
|       |    -> forkSession({ upToMessageId: prevMsgId })       |
|       |    -> close original session Query                    |
|       |    -> load forked session                             |
|       |    -> return { forkedSessionId, originalSessionId }   |
|       +-- abortTurn(sid) (existing interrupt)                 |
+---------------------------------------------------------------+
```

The rewind is a **session fork**: the original session's `.jsonl` is preserved on disk (implicit branch), and a new forked session becomes the active conversation. The SDK tracks message IDs via the `uuid` passed to each `input.push()` call.

## UX Flow

1. User hovers over a user message block, a rewind icon fades in (hidden by default, visible on hover via opacity transition)
2. User clicks the rewind icon
3. Popover opens, immediately showing "Restore conversation only" option
4. In parallel, a dry-run call fetches file change info (spinner while loading)
5. Once loaded, "Restore code and conversation" option appears with summary (e.g. "3 files changed +42 -17")
6. User picks an option
7. If agent is active, interrupt it first
8. Rewind executes, messages are removed, input box is pre-filled with the rewound message's text content (images/attachments are dropped)
9. If conversation-only rewind: toast appears "Conversation restored to earlier point - Undo" with ~10s timeout. If code+conversation rewind: no toast (file restore is irreversible)

## Contract Changes (shared/features/agent/contract.ts)

Add to the agent contract:

```typescript
rewindFilesDryRun: oc.input(z.object({ sessionId: z.string(), messageId: z.string() })).output(
  type<RewindFilesResult>(),
);

rewindToMessage: oc.input(
  z.object({
    sessionId: z.string(),
    messageId: z.string(), // SDK UUID of the target user message
    restoreFiles: z.boolean(),
  }),
).output(type<RewindResult>());
```

Note: `prevMessageId` is NOT in the contract. The backend resolves it internally by reading the `.jsonl` transcript. The renderer only needs the target `messageId`.

New type in `types.ts`:

```typescript
export type RewindResult = {
  forkedSessionId: string;
  originalSessionId: string;
  messages: ClaudeCodeUIMessage[]; // messages from the forked session
};
```

Reuses existing `RewindFilesResult` type for dry-run.

## Backend Changes (main/features/agent/session-manager.ts)

```typescript
async rewindFilesDryRun(sessionId: string, messageId: string): Promise<RewindFilesResult> {
  const session = this.sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return session.query.rewindFiles(messageId, { dryRun: true });
}

async rewindToMessage(
  sessionId: string,
  messageId: string,
  restoreFiles: boolean,
): Promise<RewindResult> {
  const session = this.sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);

  // 1. Restore files if requested (on the ORIGINAL session, which has file history)
  if (restoreFiles) {
    await session.query.rewindFiles(messageId, { dryRun: false });
  }

  // 2. Resolve prevMessageId from the .jsonl transcript
  //    Find the message immediately before the target in the transcript
  const prevMessageId = await this.findPrevMessageId(sessionId, messageId);

  // 3. Fork the conversation
  let forkedSessionId: string;
  if (prevMessageId) {
    const result = await forkSession(sessionId, {
      upToMessageId: prevMessageId,
      dir: session.cwd,
    });
    forkedSessionId = result.sessionId;
  } else {
    // Rewinding to first message — create fresh session
    const result = await this.createSession(session.cwd);
    forkedSessionId = result.sessionId;
  }

  // 4. Close original session's Query (keep .jsonl on disk for implicit branching)
  await this.closeSession(sessionId);

  // 5. Load the forked session
  const loaded = await this.loadSession(forkedSessionId, session.cwd);

  // 6. Clear stale preTurnRef and lastUserMessageId
  const forkedSession = this.sessions.get(forkedSessionId);
  if (forkedSession) {
    forkedSession.preTurnRef = undefined;
    forkedSession.lastUserMessageId = undefined;
  }

  return {
    forkedSessionId,
    originalSessionId: sessionId,
    messages: loaded.messages,
  };
}

// Reads the .jsonl transcript to find the message immediately before the target.
// Returns undefined if the target is the first message.
private async findPrevMessageId(sessionId: string, targetMessageId: string): Promise<string | undefined> {
  // Implementation: read session .jsonl, parse message entries,
  // walk until targetMessageId is found, return the previous entry's UUID.
  // Details depend on .jsonl format — the SDK provides session reading utilities.
}
```

**Message ID tracking**: The SDK UUID generated at stream time (`randomUUID()`) must be surfaced back to the renderer. Mechanism: emit a synthetic `user_message_id` chunk at the start of the `stream()` generator (right after `session.input.push()`), before the SDK starts yielding response chunks. The renderer's `ClaudeCodeChatState` stores this `sdkMessageId` on the most recent user message. This avoids changing the SDK's chunk format — it's our own envelope event. This is the linchpin: without it, no rewind button works.

## Frontend Changes

### ChatManager (renderer/src/features/agent/chat-manager.ts)

Rewind orchestration lives in the chat manager since it involves session lifecycle (fork, close, load):

```typescript
async rewindToMessage(
  sessionId: string,
  messageId: string,
  restoreFiles: boolean,
): Promise<{ forkedSessionId: string; originalSessionId: string }> {
  // 1. Call backend to fork + optionally restore files
  const result = await this.rpc.agent.rewindToMessage({
    sessionId, messageId, restoreFiles,
  });

  // 2. Create a ClaudeCodeChat for the forked session (backend already loaded it)
  const chat = new ClaudeCodeChat({
    id: result.forkedSessionId,
    transport: this.transport,
    messages: result.messages,
    ...this.#turnCallbacks,
  });
  this.chats.set(result.forkedSessionId, chat);

  // 3. Keep original chat alive during undo window (conversation-only rewinds)
  //    For file restores, dispose original immediately
  if (restoreFiles) {
    this.chats.get(sessionId)?.dispose();
    this.chats.delete(sessionId);
  }

  return { forkedSessionId: result.forkedSessionId, originalSessionId: sessionId };
}
```

### AgentStore (renderer/src/features/agent/store.ts)

New state:

```typescript
// State
rewindUndoBuffer: {
  originalSessionId: string;
  forkedSessionId: string;
} | null;

// Actions
applyRewind(originalSessionId: string, forkedSessionId: string, forkedMeta: SessionMeta): void;
undoRewind(): void;
clearRewindBuffer(): void;
```

**`applyRewind(originalSessionId, forkedSessionId, forkedMeta)`**:

1. If `rewindUndoBuffer` already exists (double rewind), finalize the old one (close old original session)
2. **Transplant metadata**: copy the original session's `title`, `createdAt`, `cwd` to the forked session — the fork should be invisible to the user
3. **Replace in sidebar**: in `agentSessions` array, replace the entry with `sessionId === originalSessionId` with the forked session's entry (same array position, same title). Do NOT add a new entry or leave the original visible
4. Register the forked session in the `sessions` map
5. Set `activeSessionId` to `forkedSessionId`
6. Remove the original session from the `sessions` map (but its .jsonl persists on disk)
7. Store `{ originalSessionId, forkedSessionId }` in `rewindUndoBuffer`

**`undoRewind()`**:

1. Close and remove the forked session
2. Re-load the original session via `chatManager.loadSession(originalSessionId, cwd)`
3. Set `activeSessionId` back to `originalSessionId`
4. Clear buffer

**`clearRewindBuffer()`**:

1. If buffer exists, the original session's Chat was kept alive — dispose it now
2. Set `rewindUndoBuffer` to `null`

Buffer lifecycle:

```
rewind -> buffer created -> [10s window]
  +-- user clicks Undo -> undoRewind() (reload original, discard fork)
  +-- timeout expires -> clearRewindBuffer() (dispose original chat)
  +-- user sends message -> clearRewindBuffer()
  +-- user switches session -> clearRewindBuffer()
  +-- user rewinds again -> finalize old buffer, create new one
```

**Key difference from previous design**: Undo is no longer an in-memory message array restore. It's a full session switch — close the fork, reload the original. This is heavier (network round-trip to reload) but consistent: both the UI and SDK agree on conversation state at all times.

### Loading state (renderer/src/features/agent/store.ts)

```typescript
isRewinding: boolean; // default false
```

Set to `true` at the start of the rewind flow (before interrupt/fork), `false` after `applyRewind()` completes (or on error). While `isRewinding` is true:

- Message input is disabled
- Rewind buttons are disabled (prevents double-rewind)
- A subtle loading indicator is shown (e.g., a small spinner near the chat or a dimmed overlay)
- The chat area remains visible but non-interactive

This covers the 1-3 second async gap (interrupt → rewindFiles → forkSession → loadSession) where the UI would otherwise be in an inconsistent state.

## UI Components

### MessageRewindButton (new component)

Rendered below each user message bubble in `message-parts.tsx`.

- Icon: `RotateCcw` from `lucide-react`
- Hidden by default, fades in on hover (`opacity-0 group-hover:opacity-100 transition-opacity`)
- Disabled when agent is streaming/submitted OR `isRewinding` is true
- Click opens a `@base-ui/react` Popover

Popover content:

```
+-------------------------------------------+
|  Restore conversation only                |  <- always visible, immediately clickable
|                                           |
|  Restore code and conversation            |  <- shown after dry-run completes
|    3 files changed  +42 -17              |    only if canRewind && filesChanged > 0
|                                           |
|  Loading file changes...                  |  <- spinner while dry-run in flight
+-------------------------------------------+
```

- On popover open: fire `client.agent.rewindFilesDryRun({ sessionId, messageId })`, result is cached per `(sessionId, messageId)` — cache invalidated on next turn completion (file state changes between turns, not within them)
- "Restore conversation only" available immediately
- "Restore code and conversation" appears once dry-run resolves, only if `canRewind && filesChanged.length > 0`
- If dry-run returns `canRewind: false`, the option simply doesn't appear

### Rewind execution flow (on option click)

1. Close popover
2. Set `store.isRewinding = true`
3. If agent is streaming/submitted: call `chat.interrupt()` first, await it
4. Extract text content from the target message for input pre-fill (before the session switches)
5. Call `chatManager.rewindToMessage(sessionId, messageId, restoreFiles)` — backend resolves fork point, forks session, switches
6. Call `store.applyRewind(originalSessionId, forkedSessionId, meta)` — transplants metadata, replaces sidebar entry, sets active session
7. Set `store.isRewinding = false`
8. Set input pre-fill text (text only, drop images/attachments)
9. If conversation-only: show undo toast. If code+conversation: no toast
10. On error at any step: set `store.isRewinding = false`, show error toast, leave original session intact

### Undo toast

Uses sonner. Only shown for "Restore conversation only" rewinds (not for file restores, which are irreversible). Action button calls `store.undoRewind()`. Auto-dismisses after ~10s triggering `store.clearRewindBuffer()`.

### Integration into message-parts.tsx

User messages wrap in a `group` class and render `MessageRewindButton` after the content:

```tsx
<div className="group relative">
  <Message from="user">
    <MessageContent>
      <p className="m-0 whitespace-pre-wrap">{part.text}</p>
    </MessageContent>
  </Message>
  <MessageRewindButton
    sessionId={sessionId}
    messageId={message.id}
    sdkMessageId={message.sdkMessageId}
    disabled={isStreaming}
  />
</div>
```

## Edge Cases

**Abort before rewind**: `chat.interrupt()` dispatches `{ kind: "interrupt" }` to the SDK, clears pending requests, calls `chat.stop()`. Rewind proceeds only after interrupt resolves.

**Changes plugin staleness**: The original session's `preTurnRef` and `lastUserMessageId` become irrelevant after fork — the forked session clears both. The Changes plugin's "last turn" view will be empty until the first turn completes in the forked session.

**Double rewind**: Dismiss existing toast, discard old undo buffer, execute new rewind, create new buffer, show new toast.

**Undo after file restore**: When files were restored via SDK, do not show the undo toast at all — the file restoration is irreversible and showing an undo toast creates a false sense of safety. The original session's Chat is disposed immediately. Undo toast is only shown for "Restore conversation only" rewinds. User has `git` and the changes plugin for file recovery if needed.

**Session switch during undo window**: `clearRewindBuffer()` called in `setActiveSession`. Toast dismissed. Original session's Chat disposed.

**Undo latency**: Undo requires reloading the original session via `loadSession()` (IPC round-trip). This adds ~100-500ms latency compared to the previous in-memory buffer approach. Acceptable for a 10s undo window — the user is already waiting for the toast to act.

**Resumed sessions**: Messages loaded via `loadSession()` include their original SDK IDs, so rewind buttons work correctly. `forkSession` remaps UUIDs, so the forked session gets fresh IDs — rewind buttons on the forked session use these new IDs.

**File history after fork**: Forked sessions start without file-history snapshots. The first turn in a forked session creates a fresh checkpoint. This means you cannot rewind files to pre-fork points, but you can rewind to any post-fork turn. This is acceptable for v1.

**Dry-run failure**: "Restore code and conversation" never shown. "Restore conversation only" remains available.

**Popover open during streaming start**: If the user opens the popover while idle and then a queued turn kicks off streaming, the popover must auto-close and the button must become disabled. The popover subscribes to chat status changes and dismisses itself when status transitions to `streaming` or `submitted`.

**Non-git repos**: SDK may return `canRewind: false`. Conversation rewind still works regardless.

**Empty rewind target**: Rewinding to the first message removes all messages. Session returns to empty state with input pre-filled.

## Files to Modify

| File                                                                   | Change                                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/features/agent/contract.ts`                                | Add `rewindFilesDryRun`, `rewindToMessage` methods                                                                             |
| `src/shared/features/agent/types.ts`                                   | Add `RewindResult` type                                                                                                        |
| `src/main/features/agent/router.ts`                                    | Wire the two new contract methods to session-manager                                                                           |
| `src/main/features/agent/session-manager.ts`                           | Add `rewindFilesDryRun()`, `rewindToMessage()` methods (fork + file restore + reload); surface SDK `uuid` in stream chunks     |
| `src/renderer/src/features/agent/chat-manager.ts`                      | Add `rewindToMessage()` orchestration (call backend, create chat for fork, manage original chat lifecycle)                     |
| `src/renderer/src/features/agent/store.ts`                             | Add `rewindUndoBuffer`, `applyRewind()`, `undoRewind()`, `clearRewindBuffer()`; call `clearRewindBuffer` in `setActiveSession` |
| `src/renderer/src/features/agent/chat-state.ts`                        | Store `sdkMessageId` on message metadata from stream chunks                                                                    |
| `src/renderer/src/features/agent/components/message-parts.tsx`         | Wrap user messages in `group` div, render `MessageRewindButton`                                                                |
| `src/renderer/src/features/agent/components/message-rewind-button.tsx` | **New file** — rewind icon + popover + dry-run fetch + execute rewind                                                          |
| `src/renderer/src/features/agent/components/agent-chat.tsx`            | Pre-fill input after rewind; clear buffer on send                                                                              |
| `src/renderer/src/features/agent/hooks/use-claude-code-chat.ts`        | Expose `sessionId` and streaming status for rewind button consumption                                                          |

**Not modified**: `.jsonl` format, `chat.ts`.

## Intentionally Deferred

- **Timeline UI** — implicit branches accumulate in `.jsonl`, future feature parses them
- **Branch switching** — data preserved, UI not built yet
- **File undo** — conversation undo only; files are one-way via SDK
- **Summarize options** — Claude Code has "summarize from/up to here"; no clear desktop UX yet
