# DingTalk Remote Control Channel

**Date:** 2026-04-07
**Status:** Approved
**Scope:** DM-only, text + images, config-based auth with allowFrom filter

## Context

The remote control feature currently supports Telegram via `TelegramAdapter`. The existing architecture has a clean `RemoteControlPlatformAdapter` interface, adapter registry, and platform-agnostic orchestration (service, command handler, session bridge, output batcher). Adding DingTalk is primarily about writing a new adapter.

**Reference implementation:** `/Users/chencheng/Documents/Code/test/neoclaw/src/channels/dingtalk.ts` (~421 lines, battle-tested DingTalk channel using `dingtalk-stream` SDK).

## Approach

**Session webhook + proactive API fallback** (proven neoclaw pattern):

- Inbound: `dingtalk-stream` WebSocket SDK (real-time, no HTTP server)
- Outbound: Session webhook first (fast, no token, 25-min TTL) → proactive DM API fallback with OAuth2 token
- HTTP calls: native `fetch` + `FormData` (no axios — project has zero axios usage)

## New Files

```
src/main/features/remote-control/platforms/dingtalk/
├── index.ts            # DingTalkAdapter class (~250 lines)
├── token.ts            # OAuth2 token cache (~40 lines)
├── media.ts            # Image download/upload helpers (~80 lines)
├── dedup.ts            # 3-layer message dedup (~60 lines)
└── session-webhook.ts  # Session webhook store with TTL (~30 lines)
```

## Modified Files

| File                                                                            | Change                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/shared/features/remote-control/types.ts`                                   | Add `DingTalkConfig` type                       |
| `src/shared/features/remote-control/platform-config.ts`                         | Add zod schema + registry entry                 |
| `src/main/index.ts`                                                             | Register `DingTalkAdapter`                      |
| `src/main/features/remote-control/remote-control-service.ts`                    | Generalize config encryption for `clientSecret` |
| `src/main/features/remote-control/platforms/types.ts`                           | Add `supportsEditing` to adapter interface      |
| `src/main/features/remote-control/output-batcher.ts`                            | Buffer-only mode when `supportsEditing = false` |
| `src/renderer/src/features/settings/components/panels/remote-control-panel.tsx` | Platform-specific config form                   |

## Dependencies

- `dingtalk-stream` (npm) — DingTalk's official WebSocket stream SDK
- All HTTP calls use native `fetch` (Node.js global in Electron) — do NOT add `axios`

## DingTalkConfig

```typescript
type DingTalkConfig = {
  clientId: string; // App Key
  clientSecret: string; // App Secret (encrypted at rest via safeStorage)
  robotCode: string; // Robot Code
  allowFrom: string[]; // Allowed sender IDs (empty = allow all)
  enabled: boolean;
};
```

Zod schema added to `platform-config.ts`:

```typescript
export const dingtalkConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  robotCode: z.string().min(1),
  allowFrom: z.array(z.string()),
  enabled: z.boolean(),
});

export const platformConfigSchemas: Record<string, z.ZodType> = {
  telegram: telegramConfigSchema,
  dingtalk: dingtalkConfigSchema,
};
```

## Adapter Interface Change: `supportsEditing`

Add to `RemoteControlPlatformAdapter` in `platforms/types.ts`:

```typescript
readonly supportsEditing: boolean;
```

- `TelegramAdapter`: `supportsEditing = true` (existing behavior unchanged)
- `DingTalkAdapter`: `supportsEditing = false`

This flag drives OutputBatcher behavior — see [OutputBatcher: Platform-Aware Streaming](#outputbatcher-platform-aware-streaming) below.

## DingTalkAdapter — Interface Implementation

```
readonly id = "dingtalk"
readonly displayName = "DingTalk"
readonly maxMessageLength = 5000
readonly supportsEditing = false
```

### Lifecycle

| Method          | Behavior                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `start(config)` | Create `DWClient`, register `TOPIC_ROBOT` callback, `connect()`. Start dedup cleanup interval. |
| `stop()`        | `disconnect()`, clear timers, clear all Maps                                                   |
| `isRunning()`   | Return connection state boolean                                                                |

### Inbound Flow

1. DingTalk stream delivers raw JSON via `TOPIC_ROBOT` callback
2. Acknowledge immediately: `socketCallBackResponse(messageId, { success: true })`
3. **3-layer dedup:**
   - Layer 1: `msgId` dedup (5-min window) — handles DingTalk retries
   - Layer 2: Content-based dedup `${senderId}:${chatId}:${text}` (5-sec window) — catches duplicates when msgId differs
   - Layer 3: Outbound dedup (5-sec window) — prevents sending identical responses
4. **`allowFrom` filter:** reject if `senderId` not in whitelist (empty list = allow all). Uses **exact match** (`config.allowFrom.includes(senderId)`) — not substring match like neoclaw, which is a security risk (neoclaw's `senderId.includes(a)` means `allowFrom: ["123"]` matches sender `"91234"`)
5. Store session webhook URL with 25-min TTL for outbound fast-path
6. Extract content:
   - `text` → plain text from `data.text.content`
   - `picture` → download image via DingTalk media API, emit path
7. Normalize to `InboundMessage`, emit `"message"` event

### Outbound

| Method                             | Behavior                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sendMessage(msg)`                 | Try session webhook → fallback to proactive DM API. Auto-detect markdown. Render `inlineActions` as numbered list. Return synthetic message ID.                             |
| `editMessage(...)`                 | **Throw error.** DingTalk doesn't support editing. The OutputBatcher won't call this when `supportsEditing = false` (see below).                                            |
| `deleteMessage(...)`               | **No-op.** DingTalk doesn't support bot-side message deletion for DMs.                                                                                                      |
| `sendFile(ref, content, filename)` | Upload via `/media/upload` using `new Blob([content])` with native `fetch` + `FormData` (no temp file needed) → send via `sampleImageMsg` (images) or `sampleFile` (other). |
| `sendTypingIndicator(...)`         | **No-op.** DingTalk has no typing indicator API for bots.                                                                                                                   |

### Test Connection

Override default `testConnection` behavior. Instead of just checking `isRunning()`, actually validate credentials by calling the OAuth2 token endpoint:

```typescript
// In RemoteControlService.testConnection, delegate to adapter-specific logic:
// DingTalk: POST /v1.0/oauth2/accessToken with clientId + clientSecret
// → success: { ok: true }
// → auth failure: { ok: false, error: "Invalid credentials" }
```

This gives meaningful feedback in the settings UI when the user enters their app key/secret.

### Inline Action Workaround

DingTalk DMs don't support inline keyboard buttons. The adapter handles this transparently:

**On sendMessage with inlineActions:**

```
Original: "Active sessions:" + [Button: "Session abc", Button: "New session"]

Rendered:
"Active sessions:

1. Session abc
2. New session

Reply with a number to select."
```

The adapter stores the action mapping per chatId:

```typescript
private pendingActions = new Map<string, InlineAction[]>();
// chatId → last presented actions
```

**On inbound message:**

- If plain number and `pendingActions` has entries for that chatId: emit as `"callback"` event with `callbackData` from the matched action
- **Clear `pendingActions` for that chatId on any inbound message** (not just number matches) — prevents stale actions from matching a future unrelated number

### Outbound: Session Webhook

Ported from neoclaw's `SessionInfo` pattern:

```typescript
// Stored per chatId, 25-min TTL (DingTalk webhooks valid ~30 min)
interface SessionWebhook {
  url: string;
  expiry: number;
}
```

- Captured from inbound message's `sessionWebhook` field
- Tried first for outbound sends (no OAuth2 token needed, lower latency)
- Expired entries cleaned up every 60 seconds
- Falls back to proactive API on failure or expiry

### Outbound: Proactive DM API

```
POST https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend
Headers: x-acs-dingtalk-access-token: {token}
Body: { robotCode, msgKey, msgParam, userIds: [userId] }
```

- `msgKey`: `"sampleText"` or `"sampleMarkdown"` (auto-detected via regex)
- `msgKey`: `"sampleImageMsg"` for images, `"sampleFile"` for files

**Important: `userIds` requires the user's `senderId`, NOT `conversationId`.** neoclaw has a latent bug here — it passes `conversationId` as `userIds`, which works only because the session webhook (primary path) is almost always available and the proactive fallback is rarely exercised. We fix this by maintaining a `conversationId → senderId` mapping:

```typescript
private senderByChat = new Map<string, string>();

// On inbound — populate mapping:
this.senderByChat.set(data.conversationId, data.senderId);

// In sendProactive — look up real userId:
const userId = this.senderByChat.get(chatId);
if (!userId) throw new Error(`No sender known for chat ${chatId}`);
payload.userIds = [userId];
```

This map is populated on every inbound message and cleared on `stop()`. For DM-only mode, each conversationId maps to exactly one senderId.

### OAuth2 Token Cache

Ported from neoclaw's `getAccessToken`:

```
POST https://api.dingtalk.com/v1.0/oauth2/accessToken
Body: { appKey: clientId, appSecret: clientSecret }
Response: { accessToken, expireIn }
```

- Cached in module-level variable
- Refreshed when within 60 seconds of expiry
- **Invalidated on `stop()`** — prevents serving stale token after config change (user switches appKey/appSecret, adapter restarts, old token would still be cached until expiry)
- Used for proactive API calls and media operations

### Pairing

`enterPairingMode()` and `exitPairingMode()` are **no-ops**. DingTalk uses config-based auth only.

## OutputBatcher: Platform-Aware Streaming

**Problem:** Without this change, the batcher calls `editMessage` on every flush (~650ms). For DingTalk, `editMessage` throws → batcher catches → falls through to `sendChunked` → sends a **new message** each time. A typical AI response would generate 5-15 separate messages flooding the chat.

**Solution:** Modify `OutputBatcher` to check `adapter.supportsEditing`:

| `supportsEditing`  | Behavior                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `true` (Telegram)  | Existing behavior — send first message, then edit in-place on each flush                        |
| `false` (DingTalk) | **Buffer-only mode** — accumulate all text, send **one complete message** on `onTurnComplete()` |

Changes to `output-batcher.ts`:

```typescript
// In OutputBatcher constructor, store the flag:
private readonly supportsEditing: boolean;

constructor(ref, adapter) {
  this.supportsEditing = adapter.supportsEditing;
}

// In append(), skip eager flush and debounce when !supportsEditing:
append(text: string): void {
  this.buffer += text;
  if (this.supportsEditing) {
    // existing logic: eager threshold + debounce
  }
  // when !supportsEditing: just buffer, don't flush
}

// In sendOrEdit(), skip edit path when !supportsEditing:
private async sendOrEdit(text: string): Promise<void> {
  if (!this.supportsEditing || !this.currentMessageId || editExpired) {
    await this.sendChunked(text);
    return;
  }
  // existing edit logic...
}
```

The user waits for the complete response then gets one clean message — standard DingTalk bot UX. Long code blocks still trigger `sendFile` on `onTurnComplete` flush.

## Config Encryption

Generalize `RemoteControlService.saveConfig/loadConfig`:

Currently handles: `botToken` ↔ `encryptedToken`
Add: `clientSecret` ↔ `encryptedSecret`

Same pattern:

- On save: `safeStorage.encryptString(clientSecret)` → base64 → store as `encryptedSecret`, delete `clientSecret`
- On load: `Buffer.from(encryptedSecret, "base64")` → `safeStorage.decryptString()` → restore as `clientSecret`

**Also update `getPlatformConfig`** (the method that returns safe config to the renderer):

- Currently strips: `botToken`, `encryptedToken`
- Must also strip: `clientSecret`, `encryptedSecret`
- Without this, DingTalk secrets leak to the renderer process

## Settings UI

The `PlatformCard` component in `remote-control-panel.tsx` currently renders Telegram-specific fields. Make it platform-aware:

**Telegram (unchanged):**

- Bot Token (password input)
- Pairing flow (start/approve/reject)

**DingTalk (new):**

- App Key (text input)
- App Secret (password input)
- Robot Code (text input)
- Allow From (comma-separated text input, optional)
- No pairing section

Implementation: `platform.id`-based conditional in `PlatformCard` JSX. Simple `if/else`, not a plugin system.

**i18n:** Existing strings are Telegram-specific (e.g., `"From @BotFather on Telegram"`). Add DingTalk-specific keys to both `en-US.json` and `zh-CN.json`:

```json
"settings.remoteControl.dingtalk.appKey": "App Key",
"settings.remoteControl.dingtalk.appKey.description": "From DingTalk Developer Console",
"settings.remoteControl.dingtalk.appKey.placeholder": "Paste App Key",
"settings.remoteControl.dingtalk.appSecret": "App Secret",
"settings.remoteControl.dingtalk.appSecret.description": "From DingTalk Developer Console",
"settings.remoteControl.dingtalk.appSecret.placeholder": "Paste App Secret",
"settings.remoteControl.dingtalk.robotCode": "Robot Code",
"settings.remoteControl.dingtalk.robotCode.description": "Your bot's robot code identifier",
"settings.remoteControl.dingtalk.robotCode.placeholder": "Paste Robot Code",
"settings.remoteControl.dingtalk.allowFrom": "Allowed Senders",
"settings.remoteControl.dingtalk.allowFrom.description": "Comma-separated DingTalk user IDs (empty = allow all)",
"settings.remoteControl.dingtalk.allowFrom.placeholder": "user1,user2"
```

## What Stays Unchanged

- `RemoteControlService` — adapter lifecycle, event routing, command dispatch
- `CommandHandler` — `/start`, `/chats`, `/status`, `/new`, etc.
- `SessionBridge` — bidirectional message routing, activity tracking
- `LinkStore` — conversation ↔ session persistence
- `formatters.ts` — platform-agnostic event formatting
- oRPC contract + router — already generic

## What Changes Minimally (non-DingTalk files)

- `platforms/types.ts` — add `readonly supportsEditing: boolean` to `RemoteControlPlatformAdapter`
- `platforms/telegram/index.ts` — add `readonly supportsEditing = true`
- `output-batcher.ts` — buffer-only mode when `supportsEditing = false` (see above)
- `remote-control-service.ts` — generalize config encryption, add `clientSecret` handling

## Registration

In `src/main/index.ts`:

```typescript
import { DingTalkAdapter } from "./features/remote-control/platforms/dingtalk";
remoteControlService.registerAdapter(new DingTalkAdapter());
```

## Edge Cases

1. **DingTalk stream disconnects** — `DWClient` handles reconnection internally. Emit `"error"` event on persistent failures.
2. **Session webhook expiry race** — 25-min TTL (5-min safety margin). On failure, immediately fall back to proactive API.
3. **Long code outputs** — OutputBatcher's existing file attachment logic works. `sendFile` uploads as DingTalk file attachment.
4. **Message length overflow** — `maxMessageLength = 5000`. OutputBatcher's `splitText` handles chunking at line boundaries.
5. **Dedup timer cleanup** — 60-second interval clears stale entries. Timer cleared on `stop()`.

## Design Decisions Log

| Decision                                      | Rationale                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native `fetch` over `axios`                   | Zero axios usage in the project. Electron Node.js has native `fetch`. Avoids unnecessary dependency.                                                                                                                                                             |
| `supportsEditing` flag on adapter interface   | Prevents OutputBatcher from flooding DingTalk with 5-15 partial messages per response. Small interface change, big UX impact.                                                                                                                                    |
| Exact match for `allowFrom`                   | neoclaw uses substring match (`senderId.includes(a)`) which is a security risk — `"123"` matches `"91234"`. Use `config.allowFrom.includes(senderId)` instead.                                                                                                   |
| Meaningful `testConnection`                   | Validate OAuth2 credentials instead of just checking `isRunning()`. Gives real feedback in settings UI.                                                                                                                                                          |
| Buffer-only streaming for DingTalk            | One clean message on turn complete is standard DingTalk bot UX. Better than progressive partial messages (impossible without editing).                                                                                                                           |
| `sendFile` via Blob, no temp file             | Native `fetch` + `FormData` accepts `new Blob([content])` directly. Avoids unnecessary disk I/O that neoclaw does with `writeFileSync` + `createReadStream`.                                                                                                     |
| Clear `pendingActions` on any inbound         | Prevents stale numbered-action mapping from matching an unrelated number in a future message.                                                                                                                                                                    |
| Invalidate token cache on `stop()`            | Module-level cache survives adapter restart. Without invalidation, a config change (new appKey) would still use the old token until expiry.                                                                                                                      |
| Strip DingTalk secrets in `getPlatformConfig` | Without this, `clientSecret`/`encryptedSecret` leak to the renderer process. Must extend the existing sensitive-field stripping.                                                                                                                                 |
| `senderByChat` map for proactive API          | neoclaw passes `conversationId` as `userIds` — wrong field. DingTalk's `oToMessages/batchSend` expects user IDs (`senderId`). Masked in neoclaw because session webhook is almost always available. We fix by maintaining a `conversationId → senderId` mapping. |
