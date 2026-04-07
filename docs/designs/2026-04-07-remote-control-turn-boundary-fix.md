# Fix: Remote Control Turn Boundary Race Condition

**Date:** 2026-04-07
**Status:** Approved
**Scope:** `packages/desktop/src/main/features/remote-control/output-batcher.ts`

## Problem

When a user sends a new prompt via Telegram shortly after the previous turn completes, the new turn's assistant response **edits the previous turn's Telegram message** instead of creating a new one.

### Root cause

`OutputBatcher.onTurnComplete()` defers clearing `currentMessageId` by 1500ms (settle delay). If the next turn's `text-delta` chunks arrive within that window, `append()` still sees the old `currentMessageId` and routes the output as edits to the old message.

### Timeline of the bug

1. Turn N ends → `onTurnComplete()` sets a 1500ms settle timer
2. User sends a new prompt within 1500ms
3. Turn N+1's first `text-delta` arrives → `append()` runs
4. `currentMessageId` still points to Turn N's Telegram message
5. `flush()` → `sendOrEdit()` → `editMessage()` — **edits Turn N's message with Turn N+1's content**
6. 1500ms later, settle timer fires and clears `currentMessageId` — too late

## Solution

Two changes in `OutputBatcher`:

### 1. Guard in `append()` — flush old turn, then reset for new turn

If a `settleTimer` is pending when new text arrives, a new turn has preempted the settle window. Flush the old turn's remaining buffer (final edit to the old Telegram message), then `reset()` to clear state so the new turn creates a fresh message.

We use `void this.flush()` before `reset()` (matching `onTurnComplete()`'s pattern) rather than `reset()` alone, because the settle buffer may contain the tail of Turn N's response — the last debounce-window worth of text (~200 chars) that `onTurnComplete()` deferred. Dropping it would silently truncate the user's response in Telegram. The `sendChunked` fallback async race is equally narrow in both call sites and is an acceptable trade-off vs. data loss.

### 2. DRY `onTurnComplete()` with `reset()`

The existing settle timer callback manually nulls `currentMessageId`, `currentMessageTimestamp`, and `fullText` — duplicating `reset()`. Replace with `reset()` for DRY. The reset must stay **synchronous** (not `.then()`) — deferring it after the async `flush()` would introduce a worse race where `reset()` could wipe a new turn's buffer that arrived during the async gap.

> **Note:** A narrow pre-existing race remains: if `flush()` → `editMessage()` fails, `sendChunked()` asynchronously re-sets `currentMessageId` after the synchronous reset. This requires edit failure + new turn arriving in a few-ms HTTP window — extremely unlikely in practice. The `append()` guard handles the common rapid-turn case.

### Code changes

```typescript
// OutputBatcher.append() — add guard at top
append(text: string): void {
  if (this.disposed) return;

  // New turn arrived while settle timer is pending — flush old turn's tail, then reset
  if (this.settleTimer) {
    this.clearTimers();
    void this.flush();
    this.reset();
  }

  this.buffer += text;
  // ... rest unchanged
}

// OutputBatcher.onTurnComplete() — DRY with reset()
onTurnComplete(): void {
  if (this.disposed) return;
  this.clearTimers();

  this.settleTimer = setTimeout(() => {
    void this.flush();
    this.reset();
  }, SETTLE_DELAY_MS);
}
```

### Why this works

| Scenario                         | Behavior                                                                   |
| -------------------------------- | -------------------------------------------------------------------------- |
| **Normal** (turns >1500ms apart) | Settle timer fires, flushes, synchronous `reset()` clears state            |
| **Rapid turns** (<1500ms)        | `append()` detects settle timer → flush old tail → `reset()` → new message |
| **Within-turn streaming**        | No settle timer active → guard never triggers, edits continue              |

### Files changed

- `output-batcher.ts` — ~5 lines added to `append()`, ~1 line changed in `onTurnComplete()`

No changes needed to `SessionBridge`, `OutputBatcherPool`, or adapter code.
