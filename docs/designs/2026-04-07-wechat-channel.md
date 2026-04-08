# WeChat Remote Control Channel

## Overview

Add WeChat as a remote control channel using the iLink Bot protocol (`ilinkai.weixin.qq.com`). Users authenticate by scanning a QR code with WeChat, then can control Neovate sessions via WeChat messages.

**Reference implementation:** `/Users/chencheng/Projects/wechatbot`

## Decisions

- **Approach:** Map QR login to existing pairing mode (Approach A)
- **Media:** Full support — images, voice (SILK decode), files, video
- **Config:** Hardcode iLink default URLs, only expose QR login + allowFrom in UI
- **QR display:** Inline in settings panel
- **Sync cursor:** Persisted for resume across restarts

---

## Platform Interface Changes (Prerequisites)

These changes extend the shared remote control infrastructure. They are required before building the WeChat adapter but benefit all platforms.

### 1. New `"config-update"` adapter event

The existing `RemoteControlPlatformEvent` has no way for an adapter to push config changes back to the service. Telegram/DingTalk don't need this (credentials are pasted upfront), but WeChat acquires its token _during_ pairing (QR scan → token). Without this, the token is lost on restart.

**In `src/main/features/remote-control/platforms/types.ts`**, add:

```ts
export type RemoteControlPlatformEvent = {
  message: (msg: InboundMessage) => void;
  callback: (msg: InboundMessage) => void;
  error: (err: Error) => void;
  "pairing-request": (req: {
    chatId: string;
    senderId: string;
    username?: string;
    chatTitle?: string;
  }) => void;
  // NEW: adapter acquired credentials or needs to persist state
  "config-update": (config: Record<string, unknown>) => void;
};
```

**In `RemoteControlService`**, listen for this event when subscribing to an adapter:

```ts
adapter.on("config-update", (config) => {
  this.saveConfig(adapter.id, config);
});
```

The WeChat adapter emits this after QR login confirms, persisting token + accountId + baseUrl. This also naturally resolves the pairing timeout race — once config is saved, the service can exit pairing mode immediately rather than waiting for the 5-minute timeout.

### 2. Extend `InboundMessage` with media support

Currently `InboundMessage` is text-only. `SessionBridge.sendToSession()` only constructs `{ type: "text" }` message parts. Images sent via any platform are silently dropped (DingTalk currently substitutes `[image]` placeholder text).

**In `src/shared/features/remote-control/types.ts`**, extend:

```ts
export type InboundMessage = {
  ref: ConversationRef;
  senderId: string;
  text: string;
  timestamp: number;
  callbackData?: string;
  // NEW: optional media attachments
  images?: Array<{ base64: string; mimeType: string }>;
};
```

**In `SessionBridge.sendToSession()`**, append image parts:

```ts
const parts: MessagePart[] = [{ type: "text", text: msg.text }];

if (msg.images?.length) {
  for (const img of msg.images) {
    parts.push({
      type: "image",
      source: { type: "base64", media_type: img.mimeType, data: img.base64 },
    });
  }
}

const uiMessage = { id: randomUUID(), role: "user", parts, createdAt: new Date() };
```

This benefits all platforms — DingTalk could later upgrade from `[image]` placeholders to real image forwarding too.

### 3. Pairing timeout alignment

The service enforces a 5-minute pairing timeout. WeChat's QR polling takes up to 480s (8 min). With the `"config-update"` event above, this resolves naturally: the adapter emits `"config-update"` on successful QR scan, the service saves config and exits pairing. The 5-minute timeout is only a safety net for abandoned pairings and doesn't need to be extended.

---

## File Structure

### New files: `src/main/features/remote-control/platforms/wechat/`

```
wechat/
├── index.ts          # WeChatAdapter implements RemoteControlPlatformAdapter
├── api.ts            # HTTP client for iLink Bot API (getupdates, sendmessage, etc.)
├── auth.ts           # QR login flow (get_bot_qrcode, poll qrcode_status)
├── cdn.ts            # AES-128-ECB encrypt/decrypt + CDN download/upload
├── media.ts          # Download images/voice/files, SILK decode
├── dedup.ts          # Message deduplication (reuse DingTalk's pattern)
├── sync.ts           # Sync cursor persistence (get_updates_buf)
└── types.ts          # iLink-specific types (WeixinMessage, MessageItem, etc.)
```

### Modified files

- `src/main/features/remote-control/platforms/types.ts` — add `"config-update"` event to `RemoteControlPlatformEvent`
- `src/shared/features/remote-control/types.ts` — extend `PlatformStatusEvent` with QR fields, extend `InboundMessage` with `images`
- `src/shared/features/remote-control/platform-config.ts` — add `WeChatConfig` type + zod schema
- `src/main/features/remote-control/remote-control-service.ts` — listen for `"config-update"` event, add WeChat token encryption/decryption
- `src/main/features/remote-control/session-bridge.ts` — handle `images` in `sendToSession()` (construct multi-part messages)
- `src/main/index.ts` — register `WeChatAdapter`
- `src/renderer/src/features/settings/components/panels/remote-control-panel.tsx` — WeChat settings UI
- i18n files — add `settings.remoteControl.wechat.*` keys

---

## Adapter Shape

```ts
export class WeChatAdapter implements RemoteControlPlatformAdapter {
  readonly id = "wechat";
  readonly displayName = "WeChat";
  readonly maxMessageLength = 4096;
  readonly supportsEditing = false; // iLink API has no message editing

  // Lifecycle
  start(config: PlatformConfig): Promise<void>; // Begin long-polling with stored token
  stop(): Promise<void>; // Abort polling loop
  isRunning(): boolean;

  // Outbound
  sendMessage(msg: OutboundMessage): Promise<string>;
  editMessage(): Promise<void>; // no-op
  deleteMessage(): Promise<void>; // no-op
  sendFile(ref, content, filename, caption?): Promise<string>; // CDN upload
  sendTypingIndicator(ref): Promise<void>; // iLink sendtyping API

  // Pairing (= QR login)
  enterPairingMode(): void; // Set flag, start() will fetch QR
  exitPairingMode(): void; // Clear flag
}
```

---

## Config Type

```ts
export type WeChatConfig = {
  token: string; // Bearer token (encrypted in store via safeStorage)
  accountId: string; // ilink_bot_id
  baseUrl: string; // API server URL (from login response)
  userId?: string; // ilink_user_id
  allowFrom: string[]; // Sender ID whitelist (empty = allow all)
  enabled: boolean;
  syncCursor?: string; // get_updates_buf for resume
};
```

Hardcoded defaults (not in config):

- iLink base URL: `https://ilinkai.weixin.qq.com`
- CDN base URL: `https://novac2c.cdn.weixin.qq.com/c2c`

---

## Adapter Start: Dual-Path Flow

`start(config)` has two distinct code paths based on whether `pairingMode` is set:

```
start(config):
  if pairingMode:
    → QR Login Path (see below)
  else if config.token exists:
    → Normal Start: skip QR, go straight to long-polling with stored token
  else:
    → Error: no token and not in pairing mode — emit error status
```

This distinction matters because `RemoteControlService.startEnabledAdapters()` calls `start()` on app launch for all enabled adapters — these must resume silently with saved tokens, not show a QR code.

### Known Limitation: `context_token` not persisted

The adapter caches `context_token` per user in memory (received with each inbound message). This token is required when sending replies. After app restart, the cache is empty — the adapter cannot send proactive messages to a user until that user sends a new message. This matches the wechatbot reference behavior and is acceptable for the remote control use case (the user always initiates).

---

## QR Login Flow (Pairing Mode)

### Sequence

```
User clicks "Connect" in Settings UI
  → renderer calls client.remoteControl.startPairing({ platformId: "wechat" })
  → RemoteControlService calls adapter.enterPairingMode() + adapter.start()
  → WeChatAdapter.start():
      1. POST /ilink/bot/get_bot_qrcode?bot_type=3
      2. Emit status event: { status: "pairing", qrCodeData: base64ImageString }
      3. UI renders QR code inline in settings panel
      4. Poll /ilink/bot/get_qrcode_status every 2s (up to 480s)
         - "wait" → keep polling
         - "scaned" → emit status: { status: "pairing", qrScanned: true }
         - "confirmed" → extract token, accountId, baseUrl
         - "expired" → emit error, exit pairing
      5. On "confirmed":
         - Emit "config-update" event with { token, accountId, baseUrl, enabled: true }
           → service persists config via saveConfig() and exits pairing mode
         - Start long-polling loop
         - Emit status: { status: "connected" }
```

### Status Event Extension

```ts
// In src/shared/features/remote-control/types.ts
export type PlatformStatusEvent = {
  platformId: string;
  status: "connected" | "disconnected" | "error" | "pairing" | "pairing-request";
  error?: string;
  // New fields for WeChat QR:
  qrCodeData?: string; // base64 QR image
  qrScanned?: boolean; // true after user scans
};
```

### Token Expiry & Reconnect

- If long-polling returns errcode `-14` (session expired) or `401/403`:
  - Stop polling
  - Emit status: `{ status: "disconnected", error: "session_expired" }`
  - UI shows "Reconnect" button which triggers `startPairing` again
- Auto-retry with backoff for transient network errors (up to 3 failures, then 30s pause)

### Timeout

- QR code polling: 480s total (matches reference), then auto-exit pairing
- Existing 5-minute service timeout is a safety net only — the `"config-update"` event exits pairing immediately on successful scan, so the timeout won't interfere with normal QR flows

---

## Message Loop & Routing

### Inbound (WeChat → Neovate)

```
Long-polling loop (35s timeout):
  POST /ilink/bot/getupdates { get_updates_buf, timeout: 35 }

  For each message in response.msgs:
    1. Dedup by message_id (5 min TTL)
    2. Skip if message_type != 1 (USER) or message_state != 0 (NEW)
    3. allowFrom filter (if configured)
    4. Extract text from item_list:
       - TEXT items → plain text
       - VOICE items → use WeChat STT text (item.voice_item.text)
       - Quoted messages → "[引用: title]\ntext"
    5. Download media if present:
       - IMAGE → CDN download + AES decrypt → base64 → attach as InboundMessage.images[]
       - VOICE → CDN download + SILK decode → WAV (optional dep), STT text as msg.text
       - FILE/VIDEO → CDN download, save to temp, mention in text
    6. Content dedup (same sender + text within 5s)
    7. Cache context_token for this sender
    8. Persist updated sync cursor (get_updates_buf)
    9. Emit "message" event (with images[] if present)
       → RemoteControlService routes to session
       → SessionBridge constructs multi-part message (text + image parts)
```

### Outbound (Neovate → WeChat)

```
sendMessage(msg: OutboundMessage):
  1. Look up context_token for msg.ref.chatId (= userId)
  2. POST /ilink/bot/sendmessage {
       to_user_id: chatId,
       context_token,
       item_list: [{ type: 1, text_item: { text } }]
     }
  3. If inlineActions present → render as numbered list (same as DingTalk)
  4. Return message_id

sendFile(ref, content, filename, caption?):
  1. Encrypt content with random AES-128-ECB key
  2. POST to CDN upload endpoint
  3. POST /ilink/bot/sendmessage with appropriate item type
     (image_item / file_item / voice_item based on extension)

sendTypingIndicator(ref):
  1. GET config (typing_ticket) via /ilink/bot/getconfig
  2. POST /ilink/bot/sendtyping { status: TYPING }
  (Cancel typing after response sent)
```

### Inline Actions (Numbered List)

WeChat doesn't support inline buttons, so render as numbered lists (same pattern as DingTalk):

```
Your message here.

1. Option A
2. Option B

Reply with a number to select.
```

User replies with a number → matched against `pendingActions` → emitted as `callback` event.

---

## iLink Bot API Reference

| Endpoint                                       | Method | Purpose                               |
| ---------------------------------------------- | ------ | ------------------------------------- |
| `/ilink/bot/get_bot_qrcode?bot_type=3`         | POST   | Generate QR code for login            |
| `/ilink/bot/get_qrcode_status?qrcode={qrcode}` | POST   | Poll QR scan status                   |
| `/ilink/bot/getupdates`                        | POST   | Retrieve pending messages (long-poll) |
| `/ilink/bot/sendmessage`                       | POST   | Send message to user                  |
| `/ilink/bot/getconfig`                         | POST   | Get typing ticket and config          |
| `/ilink/bot/sendtyping`                        | POST   | Send typing indicator                 |
| `/ilink/bot/getuploadurl`                      | POST   | Prepare media upload                  |

CDN endpoints:

- Download: `https://novac2c.cdn.weixin.qq.com/c2c/download`
- Upload: `https://novac2c.cdn.weixin.qq.com/c2c/upload`

Request headers:

```
Content-Type: application/json
AuthorizationType: ilink_bot_token
Authorization: Bearer {token}
X-WECHAT-UIN: {randomBase64}
```

All request bodies include: `"base_info": { "channel_version": "0.1.0" }`

---

## Registration & Integration

### Main process (`src/main/index.ts`)

```ts
import { WeChatAdapter } from "./features/remote-control/platforms/wechat";

remoteControlService.registerAdapter(new WeChatAdapter());
```

### Config encryption (`remote-control-service.ts`)

In `saveConfig()`:

```ts
// WeChat: encrypt token
if (typeof toStore.token === "string" && platformId === "wechat") {
  toStore.encryptedToken = safeStorage.encryptString(toStore.token).toString("base64");
  delete toStore.token;
}
```

Corresponding decryption in `loadConfig()`.

---

## Settings UI

### States for WeChat platform card in `remote-control-panel.tsx`

**Disconnected:**

- "Connect" button → triggers `startPairing`
- Enable/disable toggle (grayed when disconnected)

**Pairing (QR login):**

- QR code image rendered from `qrCodeData` (base64)
- "Scan with WeChat to connect" instruction text
- When `qrScanned` is true: "Scanned — confirm on your phone"
- "Cancel" button

**Connected:**

- Green status badge
- "Allow From" input field (sender ID whitelist, same as DingTalk)
- "Disconnect" button
- Enable/disable toggle

**Error (session expired):**

- Red status badge with "Session expired"
- "Reconnect" button → triggers `startPairing`

---

## Dependencies

- `silk-wasm` — optional dependency for SILK voice decode
- No other new dependencies — all iLink API calls use native `fetch`

---

## i18n Keys

```
settings.remoteControl.wechat.scanQR: "Scan with WeChat to connect"
settings.remoteControl.wechat.qrScanned: "Scanned — confirm on your phone"
settings.remoteControl.wechat.sessionExpired: "Session expired — reconnect required"
settings.remoteControl.wechat.allowFrom: "Allowed senders"
settings.remoteControl.wechat.allowFromHint: "User IDs (empty = allow all)"
settings.remoteControl.wechat.connect: "Connect"
settings.remoteControl.wechat.reconnect: "Reconnect"
settings.remoteControl.wechat.disconnect: "Disconnect"
```

---

## Error Handling

| Error                       | Response                                               |
| --------------------------- | ------------------------------------------------------ |
| QR expired (480s)           | Exit pairing, emit error status                        |
| Token expired (errcode -14) | Stop polling, emit disconnected with "session_expired" |
| Auth failure (401/403)      | Stop polling, clear stored token, emit disconnected    |
| Network error               | Retry up to 3 times with 2s interval, then 30s backoff |
| Message processing error    | Log error, continue polling (don't crash loop)         |

---

## Key Differences from Existing Channels

| Feature              | Telegram            | DingTalk                  | WeChat                                          |
| -------------------- | ------------------- | ------------------------- | ----------------------------------------------- |
| **Auth**             | Bot token (paste)   | App Key + Secret (paste)  | QR code scan                                    |
| **Connection**       | grammY long-polling | dingtalk-stream WebSocket | Native long-polling (35s)                       |
| **Message editing**  | Yes                 | No                        | No                                              |
| **Inline actions**   | Native buttons      | Numbered list             | Numbered list                                   |
| **Typing indicator** | Yes                 | No                        | Yes (with ticket)                               |
| **Media forwarding** | Text only\*         | Text only\*               | Images to session via `InboundMessage.images[]` |
| **Media handling**   | Telegram API        | DingTalk CDN              | AES-encrypted CDN                               |
| **Token refresh**    | N/A (permanent)     | OAuth2 token cache        | QR re-login on expiry                           |
| **Config update**    | N/A                 | N/A                       | Emits `"config-update"` after QR login          |

\* Telegram and DingTalk can be upgraded to forward images using the same `InboundMessage.images[]` field in the future.

---

## Implementation Order

Recommended sequence to minimize risk:

1. **Platform interface changes** — Add `"config-update"` event, extend `InboundMessage` with `images[]`, update `SessionBridge` (these are small, testable, and unblock everything else)
2. **WeChat adapter core** — `api.ts`, `types.ts`, `auth.ts`, `dedup.ts`, `sync.ts` (no UI needed to test)
3. **Adapter index** — `index.ts` implementing the full `RemoteControlPlatformAdapter` with text-only first
4. **Media pipeline** — `cdn.ts`, `media.ts` (AES decryption, SILK decode)
5. **Registration + UI** — Wire into `index.ts`, add settings panel, i18n keys
6. **End-to-end test** — QR login → send message → receive reply → image forwarding
