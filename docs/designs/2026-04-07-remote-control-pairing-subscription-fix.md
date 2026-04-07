# Remote Control: Wire Up Pairing Subscription + Status Sync

**Date:** 2026-04-07  
**Status:** Approved  
**Scope:** Fix pairing + UX polish (Approach A — minimal fix)

## Problem

When a user sends `/start` in Telegram during pairing mode, the bot responds with "Pairing request sent to Neovate. Please approve from the desktop app." — but the Settings UI never shows the pairing request. The approve/reject buttons never appear.

### Root Cause

`PlatformCard` in `remote-control-panel.tsx` declares `pairingRequest` state (line 80) and has full UI for approve/reject (lines 237-252), but **never subscribes to `client.remoteControl.subscribeStatus()`**. The backend event pipeline works correctly — the gap is purely on the renderer side.

### Additional Issues

1. **No real-time status sync** — Platform status only loads once on mount via `getPlatforms()`. Backend events (errors, auto-cancel after 5min, etc.) aren't reflected.
2. **Pairing state lost on navigation** — `pairing` is local `useState(false)`, not derived from `platform.pairing`. Navigating away and back resets the UI even though pairing is active on the backend.
3. **Pairing request lost on navigation** — Even if the subscription worked, navigating away and back would lose the pending pairing request because `pairingRequest` is only set via real-time events. The backend stores the `chatId` in `pairingState` but `getPlatforms()` doesn't expose it.

## Design

### Backend Changes

#### 1. Store full pairing request in `pairingState`

Currently `pairingState` only stores `chatId`. Extend to store the full request object so it can be returned via `getPlatforms()`.

**`remote-control-service.ts`:**

```typescript
// Before
private pairingState = new Map<string, { chatId?: string; timeout?: ReturnType<typeof setTimeout> }>();

// After
private pairingState = new Map<string, {
  timeout?: ReturnType<typeof setTimeout>;
  request?: { chatId: string; senderId: string; username?: string; chatTitle?: string };
}>();
```

Update `subscribeToAdapter` to store the full request:

```typescript
adapter.on("pairing-request", (req) => {
  const state = this.pairingState.get(adapter.id);
  if (state) {
    state.request = req;
  }
  this.emitStatus({ ... });
});
```

#### 2. Extend `PlatformStatus` to include pending pairing request

**`types.ts`:**

```typescript
export type PlatformStatus = {
  id: string;
  displayName: string;
  enabled: boolean;
  connected: boolean;
  pairing: boolean;
  error?: string;
  pairingRequest?: { chatId: string; senderId: string; username?: string; chatTitle?: string };
};
```

#### 3. Return pairing request from `getPlatforms()`

**`remote-control-service.ts`:**

```typescript
getPlatforms(): PlatformStatus[] {
  return this.registry.getAll().map((adapter) => {
    const pState = this.pairingState.get(adapter.id);
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      enabled: this.loadConfig(adapter.id)?.enabled ?? false,
      connected: adapter.isRunning(),
      pairing: !!pState,
      pairingRequest: pState?.request,
    };
  });
}
```

This eliminates the "missed event" class of bugs — on mount, the UI always hydrates from the latest backend state.

### Frontend Changes — `remote-control-panel.tsx`

#### 4. Single subscription in `RemoteControlPanel`, distributed to children

Instead of each `PlatformCard` creating its own `subscribeStatus()` call (N platforms = N server-side listeners), the parent `RemoteControlPanel` owns the subscription and passes the latest event per platform down as a prop.

```tsx
// In RemoteControlPanel
const [statusEvents, setStatusEvents] = useState<Record<string, PlatformStatusEvent>>({});

useEffect(() => {
  let iter: AsyncIterableIterator<PlatformStatusEvent> | undefined;
  let cancelled = false;

  (async () => {
    try {
      iter = client.remoteControl.subscribeStatus();
      for await (const event of iter) {
        if (cancelled) break;
        setStatusEvents((prev) => ({ ...prev, [event.platformId]: event }));
      }
    } catch {
      // Connection lost — refresh to get latest state
      void loadPlatforms();
    }
  })();

  return () => {
    cancelled = true;
    iter?.return?.(undefined); // properly terminate the server-side generator
  };
}, [loadPlatforms]);

// Pass to each card
<PlatformCard statusEvent={statusEvents[platform.id]} ... />
```

Key details:

- **Single subscription** — one server-side listener regardless of platform count
- **`iter.return()`** — properly terminates the async generator, which triggers the `finally` block in `router.ts` and calls `unsub()` to remove the listener. Setting `cancelled = true` alone only stops processing — it doesn't unblock the generator's `await` or clean up the server-side listener.
- **`try/catch`** — the `for await` can throw on connection loss or main process restart. Catch triggers a `loadPlatforms()` refresh to resync state.

#### 5. `PlatformCard` hydrates from props, reacts to events

```tsx
function PlatformCard({
  platform,
  statusEvent,
  onRefresh,
}: {
  platform: PlatformStatus;
  statusEvent?: PlatformStatusEvent;
  onRefresh: () => void;
}) {
  // Hydrate from backend state (survives navigation)
  const [pairing, setPairing] = useState(platform.pairing);
  const [pairingRequest, setPairingRequest] = useState(platform.pairingRequest ?? null);

  // React to real-time events
  useEffect(() => {
    if (!statusEvent) return;

    switch (statusEvent.status) {
      case "pairing-request":
        setPairingRequest(statusEvent.pairingRequest ?? null);
        break;
      case "pairing":
        setPairing(true);
        break;
      case "connected":
        setPairing(false);
        setPairingRequest(null);
        onRefresh();
        break;
      case "disconnected":
      case "error":
        setPairing(false);
        setPairingRequest(null);
        onRefresh();
        break;
    }
  }, [statusEvent, onRefresh]);

  // ... rest unchanged
}
```

### Event Flow After Fix

```
Telegram /start → TelegramAdapter emits "pairing-request"
  → RemoteControlService stores request in pairingState
  → RemoteControlService.emitStatus()
  → Router subscribeStatus yields PlatformStatusEvent
  → RemoteControlPanel useEffect receives event
  → setStatusEvents({telegram: event})
  → PlatformCard receives statusEvent prop
  → setPairingRequest({chatId, username, chatTitle, ...})
  → UI renders approve/reject buttons
```

On remount (navigation back):

```
RemoteControlPanel mounts → loadPlatforms() → getPlatforms()
  → includes pairingRequest from pairingState
  → PlatformCard initializes with platform.pairingRequest
  → UI immediately shows approve/reject buttons (no event needed)
```

### Edge Cases

| Scenario                            | Behavior                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| 5min timeout                        | Backend calls `stopPairing` → adapter restarts → emits `"connected"` → UI resets pairing state |
| Navigate away/back                  | `getPlatforms()` returns `pairing: true` + `pairingRequest` → UI hydrates correctly from props |
| Multiple platforms                  | Single subscription, events routed by `platformId` key                                         |
| Component unmount                   | `iter.return()` properly terminates server-side generator and removes listener                 |
| Platform disabled while pairing     | Parent subscription stays alive; card ignores events for disabled platforms                    |
| Connection loss                     | `catch` block triggers `loadPlatforms()` to resync                                             |
| Event arrives while panel unmounted | Stored in `pairingState` on backend; recovered on next `getPlatforms()` call                   |

### Files Modified

- `packages/desktop/src/shared/features/remote-control/types.ts` — extend `PlatformStatus` with `pairingRequest`
- `packages/desktop/src/main/features/remote-control/remote-control-service.ts` — store full request in `pairingState`, return it from `getPlatforms()`
- `packages/desktop/src/renderer/src/features/settings/components/panels/remote-control-panel.tsx` — add subscription, hydrate from props
