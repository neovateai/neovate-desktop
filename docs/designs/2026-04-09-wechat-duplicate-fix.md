# Fix: WeChat Duplicate Send/Receive

**Date:** 2026-04-09
**Status:** Proposed
**Reported by:** User mingdong (from log analysis)

## Problem

Every inbound WeChat message is processed twice, causing:

1. Duplicate messages appearing in the Neo session
2. Two LLM turns per single user message
3. Double replies sent back to WeChat

## Root Cause

`RemoteControlService.subscribeToAdapter()` adds event listeners to an adapter's emitter without removing old ones. It is called from 4 code paths (lines 78, 132, 152, 181), and when `adapter.isRunning()` returns `false`, the preceding `stopAdapter()` (which calls `removeAllListeners()`) is skipped — so old listeners accumulate.

### Reproduction flow (from log)

1. `onConfigChanged("wechat")` — adapter is running, so `stopAdapter()` clears listeners, then `subscribeToAdapter()` adds **1st set**. But `startAdapter()` fails (token required).
2. `startPairing("wechat")` — adapter is NOT running, so `stopAdapter()` is **skipped**. `subscribeToAdapter()` adds **2nd set**.
3. Adapter starts successfully with 2 sets of listeners. Every event fires twice.

### Evidence

```
15:09:12.890  wechat inbound: ... text=你好          <- adapter emits ONCE
15:09:12.891  inbound message: ... text=你好          <- listener 1
15:09:12.892  inbound message: ... text=你好          <- listener 2
```

All 6 event types are doubled: `message`, `callback`, `error`, `pairing-request`, `config-update`, `status`.

## Design

### Layer 1: Root Cause Fix — Fold `subscribeToAdapter` into `startAdapter`

**File:** `src/main/features/remote-control/remote-control-service.ts`

Every call to `subscribeToAdapter()` is immediately followed by `startAdapter()` — they're never called independently (lines 78-79, 132-134, 152-155, 181-182). Having them separate is a footgun that caused this bug. Merge them into one atomic operation.

**Delete `subscribeToAdapter()`.** Move listener setup into `startAdapter()` with a `removeAllListeners()` guard:

```typescript
private async startAdapter(
  adapter: RemoteControlPlatformAdapter,
  config: PlatformConfig,
): Promise<void> {
  adapter.removeAllListeners();
  adapter.on("message", (msg) => void this.onMessage(adapter, msg));
  adapter.on("callback", (msg) => void this.onCallback(adapter, msg));
  adapter.on("error", (err) => {
    log("adapter error %s: %O", adapter.id, err);
    this.emitStatus({ platformId: adapter.id, status: "error", error: err.message });
  });
  adapter.on("pairing-request", (req) => {
    const state = this.pairingState.get(adapter.id);
    if (state) {
      state.request = req;
    }
    this.emitStatus({
      platformId: adapter.id,
      status: "pairing-request",
      pairingRequest: req,
    });
  });
  adapter.on("config-update", (config) => {
    this.saveConfig(adapter.id, config);
    log("config-update from adapter %s", adapter.id);
  });
  adapter.on("status", (event) => {
    this.emitStatus(event);
  });

  await adapter.start(config);
  log("started adapter: %s", adapter.id);
  this.emitStatus({ platformId: adapter.id, status: "connected" });
}
```

**Remove `this.subscribeToAdapter(adapter)` from all 4 call sites** (lines 78, 132, 152, 181). Callers simplify to just `await this.startAdapter(adapter, config)`.

Why this is safe:

- `removeAllListeners()` before re-subscribing ensures exactly one set of listeners
- If `start()` throws, listeners exist but are harmless (dead adapter won't emit). Next `startAdapter()` call cleans them via `removeAllListeners()`
- No external code subscribes to adapter events
- All 3 adapters implement `removeAllListeners()` via their internal `EventEmitter`

### Layer 2: Service-level Dedup (Defense-in-depth)

**File:** same file

Add a private dedup helper used by both `onMessage()` and `onCallback()`:

```typescript
private inboundDedup = new Map<string, number>();

private isDuplicateInbound(adapter: RemoteControlPlatformAdapter, msg: InboundMessage): boolean {
  const now = Date.now();
  // Prune expired entries
  for (const [k, t] of this.inboundDedup) {
    if (now - t > 2000) this.inboundDedup.delete(k);
  }
  // Key includes callbackData for callbacks, text for regular messages
  const identity = msg.callbackData ?? msg.text.slice(0, 80);
  const dedupKey = `${adapter.id}:${msg.ref.chatId}:${msg.timestamp}:${identity}`;
  if (this.inboundDedup.has(dedupKey)) {
    log("suppressed duplicate inbound: platform=%s chat=%s", adapter.id, msg.ref.chatId);
    return true;
  }
  this.inboundDedup.set(dedupKey, now);
  return false;
}
```

Guard both handlers:

```typescript
private async onMessage(adapter: RemoteControlPlatformAdapter, msg: InboundMessage): Promise<void> {
  if (this.isDuplicateInbound(adapter, msg)) return;
  // ... existing logic unchanged
}

private async onCallback(adapter: RemoteControlPlatformAdapter, msg: InboundMessage): Promise<void> {
  if (this.isDuplicateInbound(adapter, msg)) return;
  // ... existing logic unchanged
}
```

Why both handlers:

- Callbacks are also doubled (log shows `/chat`, `/help`, `session:select` all fire twice)
- `session:select` duplication causes double `linkStore.save()` and `bridge.subscribeSession()`

Key design:

- Uses `msg.callbackData` (e.g. `session:select:fce9e7c4...`) for callbacks, `msg.text` for regular messages — avoids collision between callbacks with same text but different data
- TTL: 2 seconds — wide enough for listener-level dupes (sub-millisecond apart), tight enough to allow legitimate repeated messages
- Cleanup: inline prune, no timer needed (low message volume)

## Files Changed

1. `src/main/features/remote-control/remote-control-service.ts` — both changes

## Files NOT Changed

- Adapter code (WeChat/Telegram/DingTalk) — not needed
- `platforms/wechat/dedup.ts` — that handles API-level dedup inside the adapter, orthogonal
- Shared types — no new fields needed

## Testing

- Verify `bun ready` passes
- Manual test: connect WeChat, send messages, confirm single delivery in Neo session
- Check logs for absence of duplicate `inbound message:` lines
