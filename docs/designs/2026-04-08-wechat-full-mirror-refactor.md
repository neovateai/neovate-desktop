# WeChat Adapter: Full Mirror Refactor

## Overview

Restructure the neovate WeChat adapter internals to mirror the standalone `wechatbot` repo's module boundaries 1:1. Fix robustness gaps (session expiry recovery, auto-relogin, abort semantics) and tighten type safety across the iLink Bot protocol layer.

**Reference repo:** `git@github.com:corespeed-io/wechatbot.git` (commit b64e9e1)

## Motivation

The current adapter was written as a single-file implementation (`index.ts`, 546 lines) with the poll loop, text extraction, context token management, and message sending all inlined. The standalone `wechatbot` repo has proven, battle-tested patterns for error recovery that the adapter diverges from in critical ways:

1. **Session expiry:** wechatbot pauses 1h then retries; adapter stops dead
2. **Auth failure:** wechatbot returns `"relogin"` and outer loop re-authenticates; adapter emits error and stops
3. **Abort semantics:** wechatbot's `sleep()` rejects on abort; adapter's resolves silently (masks abort in poll loop)
4. **Type safety:** wechatbot uses typed `SendMessageReq`/`SendTypingReq`; adapter uses `Record<string, unknown>`

## Module Structure

Mirror wechatbot's file layout while keeping neovate-specific additions:

| wechatbot          | neovate (current)       | neovate (proposed)       | Change                                 |
| ------------------ | ----------------------- | ------------------------ | -------------------------------------- |
| `types.ts`         | `types.ts`              | `types.ts`               | Add missing types                      |
| `api.ts`           | `api.ts`                | `api.ts`                 | Type tightening + `buildBaseInfo()`    |
| `auth.ts`          | `auth.ts`               | `auth.ts`                | Accept `baseUrl` param                 |
| `cdn.ts`           | `cdn.ts`                | `cdn.ts`                 | No change                              |
| `media.ts`         | `media.ts`              | `media.ts`               | No change                              |
| `messaging.ts`     | _(inlined in index.ts)_ | **New: `messaging.ts`**  | Extract text extraction + send helpers |
| `monitor.ts`       | _(inlined in index.ts)_ | **New: `monitor.ts`**    | Extract poll loop with error recovery  |
| `bot.ts` (relogin) | _(missing)_             | Absorbed into `index.ts` | Add relogin orchestration              |
| —                  | `dedup.ts`              | `dedup.ts`               | No change (neovate-specific)           |
| —                  | `sync.ts`               | `sync.ts`                | No change (neovate-specific)           |

## Prerequisites

Before implementation, verify:

- **`PlatformStatusEvent` type**: The design introduces `status: "error", error: "session_paused"` on the status event. Check that `PlatformStatusEvent` in `src/shared/features/remote-control/types.ts` has an `error` string field. If not, extend the type and update the renderer panel to display the pause/expired state. This is a shared type change — don't discover it mid-implementation.

## Implementation Order

Files have dependencies — implement in this order so each step typechecks independently:

1. **`types.ts`** — Pure type additions, no deps
2. **`api.ts`** — Imports from types.ts; `buildBaseInfo()` + type tightening
3. **`messaging.ts`** — New file; imports from api.ts and types.ts
4. **`monitor.ts`** — New file; imports from api.ts and types.ts
5. **`auth.ts`** — Small signature change (add `baseUrl` param)
6. **`index.ts`** — Imports from all above; do last

Each step can be a separate commit if desired.

## Detailed Changes

### 1. `types.ts` — Add Missing Types

Add types that wechatbot has but neovate is missing:

```ts
export interface BaseInfo {
  channel_version?: string;
}

export interface TextItem {
  text?: string;
}

export interface SendMessageReq {
  msg?: WeixinMessage;
}

export interface SendTypingReq {
  ilink_user_id?: string;
  typing_ticket?: string;
  status?: number;
}

export interface GetUploadUrlReq {
  filekey?: string;
  media_type?: number;
  to_user_id?: string;
  rawsize?: number;
  rawfilemd5?: string;
  filesize?: number;
  no_need_thumb?: boolean;
  aeskey?: string;
}
```

Expand existing types to match wechatbot:

- `ImageItem`: add `mid_size?`, `thumb_size?`, `hd_size?`
- `FileItem`: add `md5?`, `len?`
- `VideoItem`: add `play_length?`, `thumb_media?`
- `WeixinMessage`: add `update_time_ms?`
- `MessageItem`: add `create_time_ms?`, `update_time_ms?`, `is_completed?`, `msg_id?`
- `MessageType`: add `NONE: 0`
- `MessageItemType`: add `NONE: 0`

### 2. `api.ts` — Type Tightening + `buildBaseInfo()`

- Add `buildBaseInfo()` helper function, replace all inline `{ channel_version: VERSION }`
- Type `sendMessage` body param as `SendMessageReq` (currently `Record<string, unknown>`)
- Type `sendTyping` body param as `SendTypingReq` (currently inline object)
- Align `getUploadUrl` params with `GetUploadUrlReq` type

### 3. `auth.ts` — Accept `baseUrl` from Config

Change `performQRLogin` signature:

```ts
// Before
export async function performQRLogin(
  callbacks: QRLoginCallbacks,
  signal: AbortSignal,
): Promise<QRLoginResult>;

// After
export async function performQRLogin(
  baseUrl: string,
  callbacks: QRLoginCallbacks,
  signal: AbortSignal,
): Promise<QRLoginResult>;
```

Remove hardcoded `DEFAULT_BASE_URL` usage inside the function. The caller (`index.ts`) passes `wcConfig.baseUrl ?? DEFAULT_BASE_URL`.

### 4. `messaging.ts` — New File

Extract text extraction and send helpers from `index.ts`. **Justified divergence from wechatbot:** context tokens stay as an adapter instance field (not a module singleton) because the desktop adapter can `stop()` + `start()` across reconnects, and module-level state would leak between instances.

```ts
// Text extraction (from index.ts lines 500-531)
export function extractTextBody(itemList?: MessageItem[]): string;

// Send text (from index.ts lines 471-495)
// Caller passes contextToken explicitly — no module-level token store
export async function sendText(params: {
  baseUrl: string;
  token: string;
  to: string;
  text: string;
  contextToken?: string;
}): Promise<void>;
```

Private helpers: `isMediaItem()`, `generateClientId()` (with `neovate:` prefix).

Context token map (`this.contextTokens`) remains on the `WeChatAdapter` class instance. The adapter passes the token to `sendText()` and other callers via parameter — same pattern the current code already uses, avoids module-level singleton issues.

### 5. `monitor.ts` — New File (Critical)

Extract poll loop with wechatbot's proven error recovery:

```ts
export type MonitorExitReason = "aborted" | "relogin";

export type MonitorCallbacks = {
  /** Called for each inbound message that passes protocol-level filters. */
  onMessage: (msg: WeixinMessage) => Promise<void>;
  /** Called when sync cursor updates. */
  onSyncCursor: (cursor: string) => void;
  /** Called on status changes. Only emit "resumed" after first successful poll post-pause. */
  onStatus: (status: "pausing" | "resumed") => void;
};

export async function startMonitor(params: {
  baseUrl: string;
  token: string;
  initialSyncCursor: string;
  callbacks: MonitorCallbacks;
  signal: AbortSignal;
}): Promise<MonitorExitReason>;
```

**Protocol-level filtering inside `monitor.ts`** (moved from `processMessage` in `index.ts`):

- Skip messages where `message_type !== MessageType.USER`
- Skip messages where `message_state !== MessageState.NEW`
- Skip messages with empty `from_user_id`

This is protocol logic, not adapter policy. Adapter-specific filtering (dedup, `allowFrom`) stays in `index.ts`.

**Behavioral changes from current `pollLoop`:**

| Behavior                     | Current                  | Proposed (match wechatbot)                                                      |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Session expiry (-14)         | `emit("error")` + stop   | Call `onStatus("pausing")`, pause 10min\*, then continue. Reset failure counter |
| Auth failure (3 consecutive) | `emit("error")` + stop   | Return `"relogin"`                                                              |
| `sleep()` on abort           | Resolves silently        | Rejects with `Error("aborted")`                                                 |
| Exception catch + backoff    | 2s/30s, continue         | Same (already matches)                                                          |
| Dynamic timeout              | Already matches          | Same                                                                            |
| Message filtering            | Done in `processMessage` | Protocol filters in monitor, policy filters in adapter                          |

> _\*Desktop UX adjustment: wechatbot pauses 1h on session expiry (acceptable for a headless server bot). For a desktop app where the user is watching, 10 minutes is more appropriate. If the session is truly dead, the monitor will hit auth failures after resuming and return `"relogin"` promptly._

The `sleep()` function matches wechatbot's reject-on-abort semantics. **Every `await sleep()` call site must be wrapped in try/catch** that returns `"aborted"`:

```ts
// Pattern used at all 3 sleep call sites in the monitor loop:
try {
  await sleep(duration, signal);
} catch {
  return "aborted";
}
```

**Listener cleanup note:** Each `sleep()` adds an `abort` listener with `{ once: true }`. On the normal path (timeout fires, no abort), the listener remains on the signal until the signal is aborted or GC'd. This is not a leak — the `AbortController` is scoped to the adapter lifecycle (`start()` creates it, `stop()` aborts it), so lingering listeners are bounded and cleaned up on stop. Add a one-line comment in the implementation so a future reader doesn't "fix" this.

**`onStatus("resumed")` timing:** Only emit after the first successful `getUpdates` response following a pause — not optimistically before the retry poll. If the retry also fails, the user shouldn't see a false "connected" flash.

### 6. `index.ts` — Slim Adapter with Auto-Relogin

The adapter class delegates to extracted modules. The relogin handler **auto-enters pairing mode** (mirroring wechatbot's `while(true)` loop in `bot.ts`), rather than stopping and waiting for the user to manually click Reconnect.

**Relogin race guard:** Before entering QR login on relogin, check `this.pairingMode` to prevent concurrent login flows (user could click "Reconnect" in UI at the same moment):

```ts
private async runWithMonitor(signal: AbortSignal): Promise<void> {
  while (!signal.aborted && this.running && this.config) {
    const reason = await startMonitor({
      baseUrl: this.config.baseUrl,
      token: this.config.token,
      initialSyncCursor: this.syncCursor.get(),
      callbacks: {
        onMessage: (msg) => this.processMessage(msg),
        onSyncCursor: (cursor) => this.syncCursor.update(cursor),
        onStatus: (status) => {
          if (status === "pausing") {
            this.emitter.emit("status", {
              platformId: this.id,
              status: "error",
              error: "session_paused",
            });
          } else if (status === "resumed") {
            this.emitter.emit("status", {
              platformId: this.id,
              status: "connected",
            });
          }
        },
      },
      signal,
    });

    if (reason === "aborted") return;

    if (reason === "relogin") {
      log("monitor requested relogin, auto-entering pairing mode");

      // Guard: prevent concurrent QR login flows
      if (this.pairingMode) return;
      this.pairingMode = true;

      // Reset dedup state — old entries could suppress valid messages post-relogin
      this.dedup.stop();
      this.dedup.start();

      // Clear stored credentials
      this.emitter.emit("config-update", {
        ...this.config,
        token: undefined,
        accountId: undefined,
      });

      // Auto-trigger QR login — UI gets new QR code without user action.
      // If QR login fails (user doesn't scan within 480s), runQRLogin
      // catches the error and emits error status. The user can still
      // click Reconnect manually. We don't auto-retry QR login because
      // it requires human action (phone scan) — retrying would just
      // cycle through expired QR codes.
      void this.runQRLogin(this.config, signal);
      return;
    }
  }
}
```

**Sync cursor preservation on relogin:** When `runQRLogin` succeeds and calls `this.syncCursor.init()`, it must use the latest in-memory cursor, not the stale one from the config object:

```ts
// In runQRLogin, after login success:
// Use latest cursor from the live store, not wcConfig.syncCursor (which is stale)
const latestCursor = this.syncCursor.get();
this.syncCursor.init(latestCursor || wcConfig.syncCursor || "", (cursor) => {
  this.emitter.emit("config-update", { ...this.config, syncCursor: cursor });
});
```

**What stays in `index.ts`:**

- `WeChatAdapter` class implementing `RemoteControlPlatformAdapter`
- `processMessage()` — dedup, `allowFrom` filter, inline action matching, event emission
- `contextTokens` map (instance field, not module singleton)
- `sendMessage()` / `editMessage()` / `deleteMessage()` / `sendFile()` / `sendTypingIndicator()`
- Pairing mode lifecycle (`enterPairingMode`, `exitPairingMode`, `runQRLogin`)
- `pendingActions` map for inline action matching
- Event emitter delegation (`on`, `off`, `removeAllListeners`)

**What moves out:**

- `extractTextBody()` + `isMediaItem()` → `messaging.ts`
- `sendText()` helper → `messaging.ts`
- `pollLoop()` → `monitor.ts` as `startMonitor()`
- `sleep()` → `monitor.ts`
- Protocol-level message filtering → `monitor.ts`

## Design Decisions

### Why context tokens stay as instance field (diverges from wechatbot)

wechatbot uses a module-level `Map` singleton — fine for a single-process CLI bot. The desktop adapter can `stop()` + `start()` across reconnects. A module singleton would leak state between lifecycle rounds and break if a second instance ever existed. Keeping it as `this.contextTokens` with explicit clearing in `stop()` is safer. The `sendText()` function receives the token as a parameter rather than looking it up internally.

### Why 10min pause instead of 1h (diverges from wechatbot)

wechatbot runs headless on a server — nobody watches it. A 1h silent pause in a desktop app where the user is staring at the UI is hostile. 10 minutes is long enough for transient backend issues to resolve, short enough that a truly dead session gets escalated to relogin promptly. The `onStatus("pausing")` callback lets the UI show "Session paused, retrying..." so the user isn't left guessing.

### Why auto-relogin instead of manual reconnect

The user chose "auto-recover like wechatbot." wechatbot's `bot.ts` has a `while(true)` loop that auto-re-enters QR login. The adapter mirrors this by calling `runQRLogin()` on relogin, which emits a new QR code to the UI. The user still needs to scan (can't avoid that), but they don't need to find and click a Reconnect button. Auto-relogin is _initiated_ automatically but not _retried_ if QR login fails — QR scan requires human action, so retrying would just cycle through expired QR codes with nobody scanning them.

### Why protocol filters move to monitor.ts

Filtering out non-USER messages and non-NEW states is iLink protocol logic — it would be the same regardless of what adapter consumes the messages. Dedup and `allowFrom` are adapter-specific policy. Separating these concerns makes `monitor.ts` a clean, reusable protocol-level polling loop.

### Why dedup state is reset on relogin

After a session expires and the monitor exits, old dedup entries (5-min message ID TTL, 5s content TTL) could suppress valid messages in the new session. The relogin handler calls `this.dedup.stop(); this.dedup.start()` to clear stale entries before starting the new polling session.

### Why sync cursor uses live value on relogin

During polling, `this.syncCursor` is continuously updated via `onSyncCursor` callbacks and persisted to the config store via `config-update` events. But `this.config` (the adapter's cached config) still holds the cursor from startup time. On relogin, `runQRLogin` must use `this.syncCursor.get()` (the latest in-memory value) rather than `wcConfig.syncCursor` (the stale startup value) to avoid re-processing old messages.

## Testability

The extraction yields independently testable modules:

- **`monitor.ts`**: Mock `getUpdates` responses, assert `onMessage`/`onStatus`/`onSyncCursor` callback invocations, verify `MonitorExitReason` under various error scenarios (session expiry, auth failure, abort). No EventEmitter or adapter state to set up.
- **`messaging.ts`**: Pure functions — `extractTextBody` and `sendText` can be unit tested with mock API calls. No adapter instance required.
- **`index.ts`**: Integration tests focus on adapter lifecycle, dedup policy, and event routing — not protocol details.

The current monolithic `index.ts` with interleaved EventEmitter, internal Maps, and HTTP calls is difficult to test in isolation.

## Files Unchanged

- `cdn.ts` — Already equivalent to wechatbot (Buffer-based upload is a valid desktop adaptation vs wechatbot's file-path-based)
- `media.ts` — Already equivalent (in-memory base64 is correct for desktop vs wechatbot's temp-file approach)
- `dedup.ts` — Neovate-specific addition, no wechatbot equivalent (good)
- `sync.ts` — Neovate-specific addition, no wechatbot equivalent (good)

## Estimated Impact

| File           | Action | Lines (est.)                                |
| -------------- | ------ | ------------------------------------------- |
| `types.ts`     | Edit   | +40                                         |
| `api.ts`       | Edit   | ~20 changed                                 |
| `auth.ts`      | Edit   | ~5 changed                                  |
| `messaging.ts` | New    | ~70 (no context token store)                |
| `monitor.ts`   | New    | ~130 (includes protocol filters + onStatus) |
| `index.ts`     | Edit   | ~200 removed, ~40 added                     |

Net: `index.ts` 546 → ~280 lines. Two new focused modules (~200 lines total).

## Not In Scope

- Shared `@neovate/ilink-protocol` package extraction (Approach C — deferred)
- Voice SILK decode integration (STT text path works; decode is already implemented but unused in both repos)
- CDN base URL configurability (hardcoded URL is stable)
- `session.ts` equivalent (neovate uses SessionBridge for LLM routing, not applicable)
