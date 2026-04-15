# Fix: Model Switch Crash on Rapid Selection

## Problem

Rapidly switching the global model in Settings causes an app crash (exit code 1).

**Root cause**: Each model switch triggers `invalidateNewSessions()` which destroys all "new" sessions and creates replacements (~2s each to init). When switching faster than sessions can initialize, sessions pile up and `closeSession` is called on sessions still awaiting `initializationResult`. The SDK rejects with `"Query closed before response received"`, which becomes an **unhandled promise rejection** in the main process.

**Evidence from `/tmp/dev.log`**:

- 15+ model switches in ~23 seconds (08:19:09 → 08:19:32)
- `remainingSessions` counter climbs: 2 → 3 → 4
- Fatal: `neovate:orpc unhandledRejection: Error: Query closed before response received`
- `Exited with code 1`

## Design Principle

Abort means **"stop AND clean up"**, not just "stop doing more work". Every abort checkpoint that follows a successful `createSession` must clean up the session on both the renderer (`this.chats`) and the main process (`closeSession` IPC). Bare `return` on abort is only safe before any resources have been allocated.

Every promise from cleanup work (`removeSession`) must be chained or caught — a floating `removeSession()` whose rejection goes uncaught is the same class of bug we're fixing.

## Design

### Fix 1: Encapsulate model switch into a single `switchGlobalModel` method (renderer)

**File**: `src/renderer/src/features/agent/chat-manager.ts`

Currently `handleSelect` in `agents-panel.tsx` fires two independent side effects:

1. `client.config.setGlobalModelSelection(...)` — IPC to persist the setting
2. `claudeCodeChatManager.invalidateNewSessions(cwd)` — session lifecycle

These should be a single method on `ClaudeCodeChatManager` that owns the AbortController, the IPC, and the session lifecycle together as one atomic unit.

**New method**: `switchGlobalModel(providerId, model, cwd)`

```typescript
private switchController: AbortController | null = null;

switchGlobalModel(
  providerId: string | null,
  model: string | null,
  cwd: string | undefined,
): void {
  // 1. Abort any previous switch in progress
  this.switchController?.abort();
  this.switchController = new AbortController();
  const { signal } = this.switchController;

  // 2. Persist the setting (only the last call matters, but safe to fire each time)
  client.config.setGlobalModelSelection({ providerId, model });

  // 3. Invalidate sessions with abort awareness
  // Catch internally — this is fire-and-forget from the caller's perspective.
  // Without this catch, a throw inside invalidateNewSessions becomes an
  // unhandled promise rejection — the exact class of bug we're fixing.
  if (cwd) {
    this.invalidateNewSessions(cwd, signal).catch((err) => {
      log("switchGlobalModel: invalidation failed error=%s",
        err instanceof Error ? err.message : String(err));
    });
  }
}
```

**Key**: The method is `void`, not `async`. The `.catch()` on the internal promise prevents unhandled rejections. Without it, any throw inside `invalidateNewSessions` (unexpected error in `removeSession`, network failure, etc.) would crash the process — the exact same class of bug we're fixing.

**File**: `src/renderer/src/features/settings/components/panels/agents-panel.tsx`

`handleSelect` becomes a one-liner calling the new method. Add an early return when the selection hasn't changed to avoid a pointless session destroy/create cycle on re-click of the same model.

```typescript
const handleSelect = useCallback(
  (value: unknown) => {
    const { providerId, model } = decodeValue(value as string);
    if (providerId === selectedProviderId && model === selectedModel) return;
    log("global model selection: providerId=%s model=%s", providerId, model);
    setSelectedProviderId(providerId ?? undefined);
    setSelectedModel(model ?? undefined);
    const projectPath = useProjectStore.getState().activeProject?.path;
    claudeCodeChatManager.switchGlobalModel(providerId, model, projectPath);
  },
  [selectedProviderId, selectedModel],
);
```

### Fix 2: Thread abort signal through the entire invalidation pipeline (renderer)

**File**: `src/renderer/src/features/agent/chat-manager.ts`

Change `invalidateNewSessions` to accept an `AbortSignal` and check it at every async boundary. **Critically**, abort checkpoints after a `createSession` must clean up the orphaned session before returning.

`createSession` does two things: (a) creates a session on the main process via IPC, and (b) stores a `ClaudeCodeChat` in `this.chats`. If we abort after creation but before `registerSessionInStore`, both the main-process session and the renderer chat object leak — nobody tracks them, nobody closes them.

```typescript
async invalidateNewSessions(cwd: string, signal?: AbortSignal): Promise<void> {
  const store = useAgentStore.getState();
  let removedActive = false;

  for (const [id, session] of store.sessions) {
    if (signal?.aborted) return;              // safe: no resources allocated yet in this iteration
    if (session.isNew) {
      if (id === store.activeSessionId) removedActive = true;
      await this.removeSession(id);
      useAgentStore.getState().removeSession(id);
    }
  }

  if (signal?.aborted) return;                // safe: between remove and create

  if (removedActive && cwd) {
    const result = await this.createSession(cwd);
    if (signal?.aborted) {                    // CLEANUP: session created but no longer wanted
      await this.removeSession(result.sessionId);
      return;
    }
    registerSessionInStore(result.sessionId, cwd, result, true);
  }

  if (signal?.aborted) return;                // safe: between create and pre-warm

  if (cwd) {
    this.preWarmForProject(cwd, signal);
  }
}
```

**Key detail**: The abort signal can't interrupt an in-progress `await` (e.g. mid-`removeSession` which does `stop()` + `dispose()` + IPC). The checkpoints run _between_ awaits, so cleanup of the current step always finishes before aborting. This is safe — a partially-removed session would be worse than a slightly delayed abort.

### Fix 3: Pass abort signal into `preWarmForProject` with cleanup (renderer)

**File**: `src/renderer/src/features/agent/chat-manager.ts`

Currently `preWarmForProject` fires its own `createSession` that is not guarded by the signal. Same orphan problem: if abort fires after `createSession` resolves but before `registerSessionInStore`, the session leaks on both sides.

The cleanup `removeSession` call must be `return`ed into the `.then()` chain so its rejection is caught by the existing `.catch()`. A bare `this.removeSession(sessionId)` without `return` creates a floating promise — if `removeSession` rejects, that rejection is unhandled.

```typescript
preWarmForProject(cwd: string, signal?: AbortSignal): void {
  if (!useConfigStore.getState().preWarmSessions) return;
  if (signal?.aborted) return;

  const existing = findPreWarmedSession(cwd);
  if (existing && existing !== useAgentStore.getState().activeSessionId) {
    log("preWarmForProject: already have a background pre-warmed session, skipping");
    return;
  }

  log("preWarmForProject: creating background session cwd=%s", cwd);
  this.createSession(cwd)
    .then(({ sessionId, commands, models, currentModel, modelScope, providerId }) => {
      if (signal?.aborted) {
        // CLEANUP: session created but switch was aborted — tear it down.
        // Return the promise so rejection chains into .catch() below.
        log("preWarmForProject: aborted after create, cleaning up sessionId=%s", sessionId);
        return this.removeSession(sessionId);
      }
      log("preWarmForProject: created %s currentModel=%s", sessionId, currentModel);
      registerSessionInStore(sessionId, cwd, { commands, models, currentModel, modelScope, providerId }, false);
    })
    .catch((error) => {
      log("preWarmForProject: FAILED error=%s", error instanceof Error ? error.message : String(error));
    });
}
```

### Fix 4: Guard `initSession` against mid-init close (main process)

**File**: `src/main/features/agent/session-manager.ts`

In `initSession`, the `await initializationResult` rejects when the session's query is closed externally. This rejection propagates as an unhandled rejection because the caller (`createSession` in the IPC handler) doesn't have adequate error handling for this specific race.

**Change**: Wrap `await initializationResult` in a try-catch. If the session has been removed from `this.sessions` (indicating a concurrent close), log and throw a controlled error. This prevents the unhandled rejection from crashing the process.

```typescript
try {
  const initResult = await initializationResult;
  // ... process initResult
} catch (err) {
  if (!this.sessions.has(sessionId)) {
    log("initSession: session closed during init sessionId=%s", sessionId);
    throw new Error("Session closed during initialization");
  }
  throw err;
}
```

This is defense-in-depth: even if the renderer-side abort logic works perfectly, the main process should never crash from a concurrent close.

## Files Changed

| File                                                                    | Change                                                                                                                                                                                                         | Lines |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `src/renderer/src/features/agent/chat-manager.ts`                       | Add `switchGlobalModel` with AbortController + `.catch()`; thread signal through `invalidateNewSessions` and `preWarmForProject`; cleanup on abort after `createSession`; chain `removeSession` into `.then()` | ~30   |
| `src/renderer/src/features/settings/components/panels/agents-panel.tsx` | Simplify `handleSelect` to call `switchGlobalModel`; skip no-op re-selection                                                                                                                                   | ~3    |
| `src/main/features/agent/session-manager.ts`                            | try-catch around `await initializationResult` in `initSession`                                                                                                                                                 | ~8    |

## Not Changed

- `claude-settings.ts` — the sync `writeFileSync` is idempotent (last-write-wins), not worth debouncing
- `config/router.ts` — no changes needed

## Edge Cases

| Scenario                                               | Behavior                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same model re-selected                                 | Early return in `handleSelect` — no IPC, no session churn                                                                                               |
| Abort between remove and create → no active session    | Next `switchGlobalModel` call runs a fresh invalidation; the `removedActive` flag is re-evaluated from current store state                              |
| Abort after `createSession` in `invalidateNewSessions` | `await removeSession(result.sessionId)` cleans up both renderer chat (`this.chats`) and main-process session (IPC `closeSession`)                       |
| Abort after `createSession` in `preWarmForProject`     | `return this.removeSession(sessionId)` chains into `.catch()` — no orphaned sessions, no floating promises                                              |
| `switchGlobalModel` internal error                     | `.catch()` on the invalidation promise logs the error; no unhandled rejection                                                                           |
| `removeSession` rejects during abort cleanup           | In `invalidateNewSessions`: propagates to `switchGlobalModel`'s `.catch()`. In `preWarmForProject`: chained via `return`, caught by existing `.catch()` |
| `setGlobalModelSelection` IPC fires for every click    | Acceptable: `writeFileSync` is idempotent and the last write wins; debouncing would add complexity for minimal gain                                     |

## Testing

1. Open Settings → Agents panel
2. Rapidly click through model options (default → sonnet → opus → haiku → default → ...) ~10 times in 5 seconds
3. App should NOT crash
4. Only the last selected model should be active
5. Only one pre-warmed session should exist after the dust settles
6. Verify `remainingSessions` in logs does not climb unboundedly
7. Check no orphaned sessions remain after rapid switching settles (main process session count should match renderer store)
8. Re-click the already-selected model — verify no session churn in logs
