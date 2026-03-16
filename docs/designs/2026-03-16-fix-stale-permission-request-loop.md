# Fix Stale Permission Request Loop

**Date:** 2026-03-16
**Status:** Approved

## Problem

When a `canUseTool` permission request times out (5 min) or is aborted on the main process side, the renderer is never notified. The stale request stays in `store.pendingRequests`, the dialog keeps rendering, and user clicks produce an infinite `unknown requestId` -> `ok: false` -> no cleanup loop.

Observed in production logs: a single stale requestId (`94c27833`) was retried **68 times** over 8+ minutes, completely blocking the permission UX.

### Timeline from logs

1. `12:59:35` - Permission request `94c27833` (Edit) created
2. `13:04:35` - 5-min timeout fires on main, auto-denies SDK promise, deletes from `pendingRequests` map
3. `13:04:39` - SDK moves to next tool, new request `cee2649e` arrives (renderer now has 2 stale requests)
4. `13:17:15` - User clicks allow on `94c27833` -> main returns `unknown requestId` -> `ok: false`
5. `13:17:15 - 13:25+` - User clicks allow/deny dozens of times, every dispatch fails, request never removed

### Root cause

Two bugs:

1. **Main -> renderer desync**: `settle()` in `canUseTool` resolves the SDK promise and deletes the requestId from `session.pendingRequests`, but never publishes an event to tell the renderer to clear its copy.
2. **Renderer ignores dispatch failure**: `respondToRequest` only removes the request from the store when `ok: true`. When `ok: false` (stale request), it keeps the request, so the dialog loops forever.

## Changes

3 files, ~20 lines of code.

### 1. `src/shared/claude-code/types.ts` - New event kind

Add `request_settled` to the `ClaudeCodeUIEvent` union:

```typescript
export type ClaudeCodeUIEvent =
  | { kind: "event"; event: ClaudeCodeUIEventMessage }
  | { kind: "request"; requestId: string; request: ClaudeCodeUIEventRequest }
  | { kind: "request_settled"; requestId: string };
```

### 2. `src/main/features/agent/session-manager.ts` - Publish on timeout/abort/close

**2a. Make `settle()` return a boolean** so we only publish when it actually won the race:

```typescript
const settle = (result): boolean => {
  if (settled) return false;
  settled = true;
  clearTimeout(timer);
  signal.removeEventListener("abort", onAbort);
  session.pendingRequests.delete(requestId);
  resolve(
    result.behavior === "allow"
      ? { ...result, updatedInput: result.updatedInput ?? input }
      : result,
  );
  return true;
};
```

**2b. Gate the publish on `settle()` succeeding** (timeout + abort handlers):

```typescript
const timer = setTimeout(() => {
  if (settle({ behavior: "deny", message: "Permission request timed out" })) {
    this.eventPublisher.publish(sessionId, { kind: "request_settled", requestId });
  }
}, PERMISSION_TIMEOUT_MS);

const onAbort = () => {
  if (settle({ behavior: "deny", message: "Permission request cancelled" })) {
    this.eventPublisher.publish(sessionId, { kind: "request_settled", requestId });
  }
};
```

This avoids spurious `request_settled` events if `settle()` was already called by another path.

**2c. Publish in `closeSession`** for any pending requests it cleans up:

```typescript
for (const [requestId, pending] of session.pendingRequests) {
  clearTimeout(pending.timer);
  pending.resolve({ behavior: "deny", message: "Session closed" });
  this.eventPublisher.publish(sessionId, { kind: "request_settled", requestId });
}
```

### 3. `src/renderer/src/features/agent/chat.ts` - Two fixes

**Fix A** - Handle `request_settled` in `#handleMessage`:

```typescript
if (message.kind === "request_settled") {
  this.store.setState((state) => ({
    pendingRequests: state.pendingRequests.filter((r) => r.requestId !== message.requestId),
  }));
  return;
}
```

**Fix B** - In `respondToRequest`, remove the request regardless of `ok`:

```diff
- if (result.kind === "respond" && result.ok) {
+ if (result.kind === "respond") {
```

Both operations are idempotent (filtering a non-existent ID is a no-op), so races between Fix A and Fix B are harmless.

## Edge Cases

| Scenario                                           | Behavior                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Timeout fires, then user clicks                    | `request_settled` clears the dialog proactively. If click races first, `ok:false` cleanup handles it.         |
| Abort fires (SDK interrupt)                        | Same as timeout - `request_settled` event clears it.                                                          |
| User responds before timeout                       | Normal path. `handleDispatch` returns `ok:true`, timer cleared in `settle()`, no `request_settled` published. |
| HMR reconnect misses the event                     | Fix B ensures the next click still cleans up the stale request.                                               |
| Multiple stale requests queued                     | Each gets its own `request_settled` event. Cleared independently.                                             |
| Session closed with pending requests               | `closeSession` publishes `request_settled` for each, renderer clears them.                                    |
| `settle()` already called when timeout/abort fires | `settle()` returns `false`, publish is skipped. No spurious events.                                           |

## What this does NOT change

- No new UI (no toasts, no error states)
- No changes to the permission dialog components
- No changes to the transport layer
- `PERMISSION_TIMEOUT_MS` stays at 5 minutes
