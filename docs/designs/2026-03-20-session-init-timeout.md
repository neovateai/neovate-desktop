# Session Init Timeout & Error Recovery

## Problem

Sessions get stuck showing "Starting session..." (正在启动会话...) forever when `initializationResult()` hangs or the network interceptor subprocess fails to start.

**Root cause:** `session-manager.ts:593` calls `q.initializationResult()` with no timeout. If it hangs, the oRPC response never returns to the renderer, `activeSessionId` stays `null`, and the UI condition `!!activeProjectPath && !activeSessionId` remains `true` indefinitely.

**Secondary cause:** When `networkInspector` is enabled, `spawnClaudeCodeProcess` spawns a subprocess that often fails immediately ("Query closed before response received") with a 5s interceptor timeout — but this failure doesn't propagate back to reject the init promise.

## Approach

Timeout + error state in store. On failure, show inline error with retry button in the input toolbar. When `networkInspector` is enabled, hint the user to disable it.

## Changes

### 1. Main Process — Timeout on `initializationResult()`

**File:** `src/main/features/agent/session-manager.ts` (line 593)

Wrap `q.initializationResult()` in `Promise.race` with 10s timeout. On failure (timeout or rejection), clean up the orphaned session entry and clear the dangling timer:

```ts
const INIT_TIMEOUT_MS = 10_000;

let timer: ReturnType<typeof setTimeout>;
const timeoutPromise = new Promise<never>((_, reject) => {
  timer = setTimeout(() => reject(new Error("Session initialization timed out")), INIT_TIMEOUT_MS);
});

try {
  const initResult = await Promise.race([q.initializationResult(), timeoutPromise]);
  clearTimeout(timer!);
  return initResult;
} catch (err) {
  clearTimeout(timer!);
  await this.closeSession(sessionId); // clean up orphaned session + SDK query
  throw err;
}
```

The existing `router.ts:38-43` try-catch converts errors to `ORPCError("BAD_GATEWAY")` — no router changes needed.

### 1b. Same timeout for `loadSession`

**File:** `src/main/features/agent/session-manager.ts` (line 334)

`loadSession()` also calls `this.initSession()` with no timeout — same hang risk when resuming a session. Extract the timeout + cleanup logic into a shared helper (or just apply the same `Promise.race` pattern) so both `createSession` and `loadSession` are protected.

### 2. Renderer Store — Add `sessionInitError`

**File:** `src/renderer/src/features/agent/store.ts`

Add to `AgentState`:

```ts
sessionInitError: string | null;
setSessionInitError: (error: string | null) => void;
```

Initial value: `null`. This is separate from per-session state because the error occurs before a session exists in the store. Whether `networkInspector` is enabled is read directly from `useConfigStore` in the UI component — no duplication needed.

### 3. Renderer — Error Handling

**File:** `src/renderer/src/features/agent/hooks/use-new-session.ts`

In `createNewSession()`:

- On catch: call `setSessionInitError(error.message)`
- On success (before `registerSessionInStore`): call `setSessionInitError(null)` to clear any previous error

`preWarmSession()` also calls `createSession` with no error handling. Add a `.catch()` that logs the failure. No UI error needed (it's a background optimization), but ensure a failed pre-warm doesn't leave a stale entry that `findPreWarmedSession()` would try to reuse.

**File:** `src/renderer/src/features/agent/components/agent-chat.tsx`

In the `auto-create` effect (line 153):

- The existing `.catch()` currently just logs — also call `setSessionInitError(error.message)`
- Guard the catch against project switches: only set the error if `initializedPathRef.current` still matches `activeProjectPath`, otherwise the error belongs to a stale project:

```ts
.catch((error) => {
  if (initializedPathRef.current === activeProjectPath) {
    setSessionInitError(error instanceof Error ? error.message : String(error));
  }
});
```

Add a `retry` callback that directly calls `createNewSession()` (do NOT rely on resetting the ref to re-trigger the effect — React effects don't re-run on ref changes):

```ts
const handleRetry = useCallback(() => {
  if (!activeProjectPath) return;
  setSessionInitError(null); // optimistic: show spinner immediately
  createNewSession(activeProjectPath).catch((error) => {
    setSessionInitError(error instanceof Error ? error.message : String(error));
  });
}, [activeProjectPath, createNewSession, setSessionInitError]);
```

Pass `sessionInitError` and `onRetry` down to `MessageInput` -> `InputToolbar`.

### 4. UI — InputToolbar Error + Retry

**File:** `src/renderer/src/features/agent/components/input-toolbar.tsx`

Add props: `sessionInitError?: string | null`, `onRetry?: () => void`.

Replace the current `sessionInitializing` block (lines 89-93 + 105-108):

- **`sessionInitializing && !sessionInitError`**: current behavior (pulsing "Starting session..." + spinner)
- **`sessionInitError`**: error text + retry button. If `useConfigStore((s) => s.networkInspector)` is `true`, append hint to disable Network Inspector in Settings. Retry button replaces the spinner position (right side). Error text replaces the "Starting session..." position (left side).

### 5. i18n Keys

**File:** `src/renderer/src/locales/en-US.json`

```json
"chat.sessionInitFailed": "Session failed to start",
"chat.sessionInitRetry": "Retry",
"chat.sessionInitNetworkHint": "Try disabling Network Inspector in Settings and retry"
```

**File:** `src/renderer/src/locales/zh-CN.json`

```json
"chat.sessionInitFailed": "会话启动失败",
"chat.sessionInitRetry": "重试",
"chat.sessionInitNetworkHint": "尝试在设置中关闭网络检查器后重试"
```

## Known Gaps (out of scope)

The following callers also use `createSession` and could hang, but are lower priority since they're user-initiated actions with existing error handling or fallbacks:

- `handleProviderSwitch` in `input-toolbar.tsx` — switches provider on an empty session
- `handleContextClear` in `chat-manager.ts` — creates a new session after context clear (already has try-catch with fallback)
- `invalidateNewSessions` in `chat-manager.ts` — recreates sessions after config change

These can be addressed as follow-ups if the timeout fix surfaces errors in those paths.

## Files Modified

| File                                                           | Change                                            |
| -------------------------------------------------------------- | ------------------------------------------------- |
| `src/main/features/agent/session-manager.ts`                   | 10s timeout on `initializationResult()`           |
| `src/renderer/src/features/agent/store.ts`                     | Add `sessionInitError` + setter                   |
| `src/renderer/src/features/agent/hooks/use-new-session.ts`     | Set error on catch, clear on success              |
| `src/renderer/src/features/agent/components/agent-chat.tsx`    | Wire error/retry to effect + pass to InputToolbar |
| `src/renderer/src/features/agent/components/input-toolbar.tsx` | Render error + retry + networkInspector hint      |
| `src/renderer/src/locales/en-US.json`                          | Add 3 i18n keys                                   |
| `src/renderer/src/locales/zh-CN.json`                          | Add 3 i18n keys                                   |
