# Session Lifecycle Event Stream

**Problem:** When a new session is created via Telegram remote control (`RemoteControlService.handleSessionCallback` → `sessionManager.createSession`), the Desktop UI session list doesn't update. The renderer only calls `listSessions()` on mount or project switch — there's no subscription for session lifecycle events.

**Approach:** Add a new `eventIterator`-based subscription to the agent contract that streams session lifecycle events (created/deleted) from main → renderer. Same pattern as `remoteControl.subscribeStatus`, `updater.subscribe`, `deeplink.subscribe`.

## Shared Types & Contract

### New type in `src/shared/features/agent/types.ts`

```typescript
export type SessionLifecycleEvent = {
  type: "created" | "deleted";
  session: SessionInfo;
  /** Where the event originated — helps the renderer decide whether to show a toast */
  source: "local" | "remote-control";
};
```

### New contract method in `src/shared/features/agent/contract.ts`

```typescript
subscribeSessionLifecycle: oc.output(eventIterator(type<SessionLifecycleEvent>())),
```

## Main Process — SessionManager Lifecycle Events

Add a listener pattern to `SessionManager` (same pattern as `RemoteControlService.onStatus`):

```typescript
private lifecycleListeners: Array<(event: SessionLifecycleEvent) => void> = [];

onLifecycle(listener: (event: SessionLifecycleEvent) => void): () => void {
  this.lifecycleListeners.push(listener);
  return () => {
    this.lifecycleListeners = this.lifecycleListeners.filter((l) => l !== listener);
  };
}

private emitLifecycle(event: SessionLifecycleEvent): void {
  for (const listener of this.lifecycleListeners) {
    try { listener(event); } catch { /* ignore */ }
  }
}
```

### Emit from existing methods

- `createSession()` accepts an optional `source` parameter (default `"local"`). After session is created, emit `{ type: "created", session: { sessionId, cwd, createdAt, updatedAt }, source }`.
- `deleteSessionFile()` emits `{ type: "deleted", session, source: "local" }`. Note: `closeSession()` does NOT emit "deleted" — closing an in-memory session doesn't remove it from the persisted sidebar list.
- `RemoteControlService.handleSessionCallback` passes `{ source: "remote-control" }` when calling `createSession`.

## Router — Wire the eventIterator

In `src/main/features/agent/router.ts`, add handler for `subscribeSessionLifecycle` — identical queue+yield pattern as `remoteControl.subscribeStatus`:

```typescript
subscribeSessionLifecycle: handler(async function* ({ context, signal }) {
  const queue: SessionLifecycleEvent[] = [];
  let resolve: (() => void) | null = null;

  const unsub = context.sessionManager.onLifecycle((event) => {
    queue.push(event);
    resolve?.();
  });

  const onAbort = () => resolve?.();
  signal?.addEventListener("abort", onAbort);

  try {
    while (!signal?.aborted) {
      if (queue.length === 0) {
        await new Promise<void>((r) => { resolve = r; });
      }
      while (queue.length > 0) {
        yield queue.shift()!;
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsub();
  }
}),
```

## Renderer — Subscribe & React

### Store actions in `src/renderer/src/features/agent/store.ts`

```typescript
appendAgentSession(session: SessionInfo) {
  set((state) => {
    if (state.agentSessions.some(s => s.sessionId === session.sessionId)) return;
    state.agentSessions.unshift(session);
  });
}

removeAgentSession(sessionId: string) {
  set((state) => {
    state.agentSessions = state.agentSessions.filter(s => s.sessionId !== sessionId);
  });
}
```

### Subscription hook

A `useSessionLifecycleSubscription` hook (or inline in `agent-chat.tsx`). Must use an `AbortController` to clean up the async iterator on unmount.

```typescript
useEffect(() => {
  const ac = new AbortController();

  (async () => {
    while (!ac.signal.aborted) {
      try {
        for await (const event of client.agent.subscribeSessionLifecycle({
          signal: ac.signal,
        })) {
          if (event.type === "created") {
            store.appendAgentSession(event.session);
          } else if (event.type === "deleted") {
            store.removeAgentSession(event.session.sessionId);
          }
        }
      } catch {
        if (ac.signal.aborted) break;
        // Subscription dropped (hot-reload, crash) — reconcile by re-fetching full list
        const sessions = await client.agent.listSessions({ cwd });
        store.setAgentSessions(sessions);
      }
    }
  })();

  return () => ac.abort();
}, [cwd]);
```

Key details:

- **AbortController cleanup** — aborts the async iterator on unmount, prevents leaked subscriptions
- **Reconnection on drop** — if the subscription breaks (dev hot-reload, renderer restart), re-fetches `listSessions()` to reconcile any missed events, then re-enters the subscription loop

### TODO: Toast notifications

- Show a subtle toast for `source === "remote-control"` events (e.g. "New session from Telegram") with a "View" action button to navigate to the session
- Only show toast if `event.session.cwd` matches the currently active project (avoid noise from other projects)

## Data Flow

```
Telegram user taps "New session"
  ↓
RemoteControlService.handleSessionCallback(action: "new")
  ↓
sessionManager.createSession(project.path, { source: "remote-control" })
  ↓
SessionManager creates session, calls emitLifecycle({
  type: "created",
  session: { sessionId, cwd, createdAt, updatedAt },
  source: "remote-control"
})
  ↓
Router's subscribeSessionLifecycle generator yields event
  ↓
Renderer's useSessionLifecycleSubscription receives event
  ↓
store.appendAgentSession(event.session)  → session list updates instantly
  (dedup guard skips if sessionId already exists)
```

## Files Changed

| File                                                         | Change                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/shared/features/agent/types.ts`                         | Add `SessionLifecycleEvent` type                                                                                 |
| `src/shared/features/agent/contract.ts`                      | Add `subscribeSessionLifecycle` method                                                                           |
| `src/main/features/agent/session-manager.ts`                 | Add `onLifecycle`/`emitLifecycle`, add `source` param to `createSession`, emit on create and `deleteSessionFile` |
| `src/main/features/agent/router.ts`                          | Add `subscribeSessionLifecycle` handler (queue + yield pattern)                                                  |
| `src/main/features/remote-control/remote-control-service.ts` | Pass `{ source: "remote-control" }` to `createSession`                                                           |
| `src/renderer/src/features/agent/store.ts`                   | Add `appendAgentSession`/`removeAgentSession` actions                                                            |
| `src/renderer/src/features/agent/`                           | Add `useSessionLifecycleSubscription` hook, wire into `agent-chat.tsx`                                           |
