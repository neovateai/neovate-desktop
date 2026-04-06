# Messaging Platform Integration

**Date**: 2026-04-06
**Status**: Implemented (v1)

## Summary

Add remote control of neovate sessions from messaging platforms (Telegram first, extensible to WeChat and DingTalk). Users can send prompts, receive streamed AI output, approve plans, navigate projects/branches, and manage sessions — all from their phone.

## Requirements

- **Use case**: Remote control (bidirectional) — send prompts, approve plans, get streaming output
- **Runtime**: Inside Electron main process as a feature domain (not a plugin)
- **Scope**: Core remote control + repo/branch navigation
  - Bot token setup, session list/pick, send prompts, receive streamed AI output (batched edits), plan approval buttons, /status /stop commands, repo/branch navigation
- **Abstraction**: Full adapter framework upfront — `MessagingPlatformAdapter` interface with adapter registry
- **Config UX**: Settings panel in the desktop app ("Messaging / Integrations" section)
- **Telegram SDK**: grammY (not raw fetch)

## Architecture

### Approach: Feature-first with platform adapters

A new **feature domain** (`src/main/features/messaging/` + `src/shared/features/messaging/`) that owns the full adapter framework. Each platform (Telegram, WeChat, DingTalk) is a **platform adapter** implementing a `MessagingPlatformAdapter` interface. A `MessagingService` orchestrates platform lifecycle, routes incoming messages to `SessionManager`, and forwards session events back out.

### High-level data flow

```
Telegram/WeChat/DingTalk
        | (platform-specific protocol)
  PlatformAdapter  <->  MessagingService  <->  SessionManager
   (per-platform)       (orchestrator)        (existing)
        ^                    ^
        |                    |
   grammY / SDK         ConfigStore + safeStorage
   (internal detail)    (credentials encrypted at rest)
```

## Core Abstractions

### Types (`src/shared/features/messaging/types.ts`)

```typescript
/** Identifies a conversation location on any platform */
type ConversationRef = {
  platformId: string; // "telegram" | "wechat" | "dingtalk"
  chatId: string; // platform-specific chat identifier
  threadId?: string; // optional sub-thread (Telegram topic, DingTalk thread)
};

/** Normalized inbound message from any platform */
type InboundMessage = {
  ref: ConversationRef;
  senderId: string;
  text: string;
  timestamp: number;
  callbackData?: string; // inline button callback
};

/** What the bridge can send back to a platform */
type OutboundMessage = {
  ref: ConversationRef;
  text: string;
  replyToMessageId?: string;
  inlineActions?: InlineAction[]; // buttons
};

type InlineAction = {
  label: string;
  callbackData: string;
};

/** Platform adapter interface -- one impl per messaging platform */
interface MessagingPlatformAdapter {
  readonly id: string; // "telegram"
  readonly displayName: string; // "Telegram"
  readonly maxMessageLength: number; // 4096 for Telegram, 2048 for WeChat

  // Lifecycle
  start(config: PlatformConfig): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Outbound
  sendMessage(msg: OutboundMessage): Promise<string>; // returns platform message ID
  editMessage(
    ref: ConversationRef,
    messageId: string,
    text: string,
    actions?: InlineAction[],
  ): Promise<void>;
  deleteMessage(ref: ConversationRef, messageId: string): Promise<void>;
  sendFile(
    ref: ConversationRef,
    content: Buffer,
    filename: string,
    caption?: string,
  ): Promise<string>;
  sendTypingIndicator(ref: ConversationRef): Promise<void>;

  // Events -- adapter emits these, service subscribes
  on(event: "message", handler: (msg: InboundMessage) => void): void;
  on(event: "callback", handler: (msg: InboundMessage) => void): void;
  on(event: "error", handler: (err: Error) => void): void;

  // Cleanup -- stop() MUST call this internally; no events emitted after stop()
  removeAllListeners(): void;
}
```

## File Structure

```
src/
  shared/features/messaging/
    contract.ts              # oRPC contract (settings CRUD, status, pairing, send test message)
    types.ts                 # ConversationRef, InboundMessage, OutboundMessage, etc.
    platform-config.ts       # Per-platform config schemas (zod)

  main/features/messaging/
    messaging-service.ts     # Orchestrator: adapter registry, lifecycle, routing, config watching
    router.ts                # oRPC handler implementations
    session-bridge.ts        # Subscribes to SessionManager events -> outbound messages
    command-handler.ts       # Parses /commands from inbound messages, dispatches actions
    output-batcher.ts        # Batches streaming AI output (debounce, edit threshold)
    link-store.ts            # Persists ConversationRef <-> sessionId mappings
    formatters.ts            # Platform-agnostic markdown formatting utilities

    platforms/
      types.ts               # MessagingPlatformAdapter interface
      registry.ts            # PlatformAdapterRegistry (register, get, list)

      telegram/
        index.ts             # TelegramAdapter implements MessagingPlatformAdapter
        ui.ts                # Inline keyboard builders (using grammy's InlineKeyboard)
        handlers.ts          # grammy middleware: routes messages/callbacks -> adapter events
        markdown.ts          # Telegram MarkdownV2 escaping and formatting

  renderer/src/features/settings/
    messaging-settings.tsx   # Bot token input, pairing flow, enable/disable, connection status
```

## oRPC Contract

### `src/shared/features/messaging/contract.ts`

```typescript
export const messagingContract = {
  // Platform config management
  getPlatforms: oc.output(type<PlatformStatus[]>()),
  // e.g. [{ id: "telegram", displayName: "Telegram", enabled: true, connected: true, pairing: false }]

  configurePlatform: oc
    .input(
      z.object({
        platformId: z.string(),
        config: z.record(z.string(), z.unknown()), // platform-specific
      }),
    )
    .output(type<void>()),

  togglePlatform: oc
    .input(z.object({ platformId: z.string(), enabled: z.boolean() }))
    .output(type<void>()),

  getPlatformConfig: oc.input(z.object({ platformId: z.string() })).output(type<PlatformConfig>()),

  // Test connectivity
  testConnection: oc
    .input(z.object({ platformId: z.string() }))
    .output(type<{ ok: boolean; error?: string; botUsername?: string }>()),

  // Pairing flow -- enter/exit pairing mode, approve/reject pending chat
  startPairing: oc.input(z.object({ platformId: z.string() })).output(type<void>()),

  stopPairing: oc.input(z.object({ platformId: z.string() })).output(type<void>()),

  approvePairing: oc
    .input(z.object({ platformId: z.string(), chatId: z.string() }))
    .output(type<void>()),

  rejectPairing: oc
    .input(z.object({ platformId: z.string(), chatId: z.string() }))
    .output(type<void>()),

  // Subscribe to platform status changes (connected/disconnected/error/pairing)
  subscribeStatus: oc.output(type<PlatformStatusEvent>()),
};
```

### Telegram-specific config

```typescript
// botToken encrypted via Electron safeStorage, stored under "messaging.telegram"
{
  botToken: string;              // encrypted at rest via safeStorage
  allowedChatIds: string[];      // whitelist (populated via pairing flow)
  enabled: boolean;
}
```

## Chat ID Discovery (Pairing Flow)

Manually finding a Telegram chat ID is terrible UX. Instead, use a **pairing mode** similar to Bluetooth pairing.

### Flow

1. User enters bot token in Settings UI and clicks "Pair Chat"
2. `MessagingService` starts the adapter in **pairing mode** -- the auth middleware is relaxed to accept messages from any chat, but only responds to `/start`
3. Settings UI shows: "Send /start to your bot from Telegram to pair"
4. User opens Telegram, sends `/start` to their bot
5. The adapter captures the chat ID and sender info, emits a `pairing-request` event
6. Settings UI updates live to show: "Pairing request from @username (chat ID: 123456) -- [Approve] [Reject]"
7. User clicks "Approve" -- chat ID is added to `allowedChatIds`, pairing mode ends, adapter restarts in normal mode
8. Bot replies to the Telegram chat: "Paired successfully! Use /help to get started."

### State machine

```
Idle  --[startPairing]--> Pairing  --[/start received]--> PendingApproval
                                                             |
                                          [approve]---> Active (chat whitelisted)
                                          [reject] ---> Pairing (keep listening)
                                          [timeout 5m] -> Idle (auto-cancel)
```

### Multiple chats

Pairing can be repeated to add multiple chats. Each approved chat is appended to `allowedChatIds`. Existing chats are not affected. Users can remove chats from the Settings UI list.

## Content Sensitivity

AI output routinely contains source code, file paths, environment variables, and sometimes actual secrets (API keys in `.env` files, database URLs). All messages sent through messaging platforms are stored on their servers (Telegram, WeChat, etc.).

### Settings UI warning

The Messaging settings section must display a visible notice:

> "Messages sent via messaging platforms are stored on third-party servers. Avoid using remote control for sessions that handle sensitive credentials."

### Optional redaction mode (v2)

A future config toggle (`redactSecrets: boolean`, default off). When enabled, `formatters.ts` runs a regex pass before sending to mask patterns that look like credentials:

- API keys: `sk-...`, `ghp_...`, `AKIA...`
- Connection strings: `postgres://...`, `mongodb://...`, `redis://...`
- Generic secrets: `Bearer ...`, long base64 strings in env-var-like contexts

Not bulletproof, but catches the obvious cases. This is a v2 feature — for v1, the warning is sufficient.

## Credential Security

Bot tokens and API keys are credentials. They must not be stored as plaintext JSON on disk.

- **Write path**: `safeStorage.encryptString(token)` -> store the base64-encoded encrypted buffer via `StorageService` under `messaging.<platformId>.encryptedToken`
- **Read path**: Read encrypted buffer -> `safeStorage.decryptString(buffer)` -> use in adapter
- **Fallback**: If `safeStorage.isEncryptionAvailable()` returns false (e.g., no keychain on Linux), fall back to plaintext with a warning in the Settings UI

This uses Electron's built-in `safeStorage` API which delegates to the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret).

## Session Bridge

### Inbound flow (user sends message in Telegram -> neovate session)

```
Telegram message -> TelegramAdapter.on("message") -> MessagingService
  -> Is it a command? -> CommandHandler dispatches (/status, /stop, /chats, /repos, /branches)
  -> Is it text? -> Find linked session for this ConversationRef (via LinkStore)
    -> Session exists -> sessionManager.pushInput(sessionId, { text, source: { platform, sender } })
    -> No session linked -> Reply "No active session. Use /chats to pick one."
```

### Outbound flow (AI responds in neovate -> Telegram)

```
SessionManager.eventPublisher emits event for sessionId
  -> SessionBridge.onSessionEvent(sessionId, event)
    -> Is this sessionId linked to a ConversationRef? If not, skip.
    -> Send typing indicator (adapter.sendTypingIndicator) on 5s interval while AI is working
    -> Format event based on type:
        - agent text delta -> buffer in OutputBatcher -> when flushed, adapter.editMessage()
        - tool use start -> adapter.sendMessage("[Running: bash `ls -la`]")
        - permission request -> adapter.sendMessage("Approve?" + inline buttons)
        - turn complete -> flush batcher, send "[Turn complete]", stop typing indicator
        - error -> adapter.sendMessage("[Error: ...]")
    -> Long code blocks (>50 lines) -> adapter.sendFile() as .txt/.diff attachment
```

### Remote message source attribution

When a message arrives from a messaging platform, it is pushed to `SessionManager` with a `source` field:

```typescript
sessionManager.pushInput(sessionId, {
  text: msg.text,
  source: { platform: "telegram", sender: msg.senderId },
});
```

The renderer can then display a subtle "via Telegram" badge next to messages sent remotely. This prevents confusion when the user is at their desk watching the desktop UI while a message arrives from their phone (or from a colleague in a shared bot chat).

This requires a minor addition to the `SDKUserMessage` type — an optional `source` field. The `SessionManager` passes it through to the event publisher so the renderer can pick it up.

### Lifecycle messages

The bridge sends presence notifications to all linked conversations:

- **App shutdown** (`before-quit`): "Neovate going offline" sent to all linked conversations before adapters stop
- **App startup** (after `startEnabledAdapters`): "Neovate back online" sent to all conversations with persisted links
- **Adapter error** (persistent polling failure): "Connection lost, reconnecting..." sent if possible

### Context on session link

When a user picks a session via `/chats` inline button, the bridge sends a **context summary** before confirming the link:

```
Linked to session: "Fix auth middleware"
Last activity:
> [assistant] I've updated the auth middleware to check...
> [tool] Edited src/middleware/auth.ts (+12 -3)
> [assistant] The tests pass now. Want me to commit?
---
Send a message to continue this session.
```

The summary includes the last 3-5 messages (truncated to ~500 chars total), pulled from `SessionManager`'s event history for that session.

## Command Handler

Commands supported in initial version:

| Command            | Action                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| `/start`           | Welcome message + session list (or pairing handshake if in pairing mode) |
| `/chats`           | List active sessions with inline keyboard picker                         |
| `/repos`           | List projects with inline keyboard (from ProjectStore)                   |
| `/branches [repo]` | List git branches for a project                                          |
| `/status`          | Current linked session status (idle, working, waiting for input)         |
| `/stop`            | Abort current session turn                                               |
| `/new [project]`   | Start new session in a project                                           |
| `/help`            | Command reference                                                        |

Inline button callbacks use format: `<domain>:<action>:<id>` (e.g., `session:select:abc123`).

### `/new` Session Creation Flow

The `/new` command creates a session remotely. Full flow:

1. **Project resolution**:
   - `/new` (no argument) -> show project picker inline keyboard (same as `/repos`, but callback action is `session:new:<projectId>`)
   - `/new myproject` -> fuzzy match against `ProjectStore.getAll()`. If exactly one match, use it. If ambiguous (multiple matches), reply with inline keyboard of matching projects. If no match, reply "No project found matching 'myproject'."

2. **Model/provider selection**: Uses the existing config cascade — session config > project config > global config. Same logic as creating a session from the desktop UI. No model picker in Telegram; the user configures defaults in the desktop app.

3. **Session creation**: Calls `SessionManager.create()` with the resolved project and default config. The session appears in the desktop sidebar automatically (SessionManager emits events the renderer subscribes to). The `source` field marks the creation as "via Telegram."

4. **Auto-link**: After creation, the bridge automatically links the current `ConversationRef` to the new session (via `LinkStore.save()`). If the conversation was previously linked to another session, the old link is replaced. The user is notified:

   ```
   New session created in project "myproject"
   Model: claude-opus-4-6 (from project config)
   ---
   Session linked. Send a message to start.
   ```

5. **Error cases**:
   - Project has no configured provider -> "No provider configured for this project. Set one in the desktop app."
   - SessionManager.create() fails -> "Failed to create session: <error>". Link is not created.

## Output Batcher

Platform-agnostic batching logic (borrowed from conductor-tg's pattern). **One batcher instance per ConversationRef** — keyed by `${ref.platformId}:${ref.chatId}:${ref.threadId}`. This ensures heavy output from one session doesn't delay delivery to another.

- **Debounce window**: 650ms -- collect text deltas, then flush as a single editMessage
- **Eager edit threshold**: If buffered text > 220 chars, flush immediately (user sees progress)
- **Settle delay**: 1.5s after turn completion before sending the final message
- **Message splitting**: If output exceeds `adapter.maxMessageLength`, split into multiple messages
- **Long content fallback**: Code blocks >50 lines sent as file attachments via `adapter.sendFile()`
- **Cleanup**: Batcher instances are disposed when a conversation is unlinked or adapter stops

```typescript
class OutputBatcherPool {
  private batchers = new Map<string, OutputBatcher>();

  getOrCreate(ref: ConversationRef, adapter: MessagingPlatformAdapter): OutputBatcher {
    const key = `${ref.platformId}:${ref.chatId}:${ref.threadId ?? ""}`;
    if (!this.batchers.has(key)) {
      this.batchers.set(key, new OutputBatcher(ref, adapter));
    }
    return this.batchers.get(key)!;
  }

  dispose(ref: ConversationRef): void {
    /* cleanup */
  }
  disposeAll(): void {
    /* cleanup all on shutdown */
  }
}
```

## Conversation-Session Link Persistence

### LinkStore (`link-store.ts`)

Persists `ConversationRef <-> sessionId` mappings via `StorageService` under `messaging.links`.

```typescript
type PersistedLink = {
  ref: ConversationRef;
  sessionId: string;
  linkedAt: number; // timestamp
};

class LinkStore {
  constructor(private storage: StorageService) {}

  save(ref: ConversationRef, sessionId: string): void;
  remove(ref: ConversationRef): void;
  getSessionId(ref: ConversationRef): string | null;
  getRef(sessionId: string): ConversationRef | null;
  getAllLinks(): PersistedLink[];
}
```

**On startup**, `MessagingService` loads persisted links and validates them:

- Session still exists in `SessionManager` -> restore link, send "Reconnected to session: ..."
- Session no longer exists -> remove stale link silently

**On session close** (from desktop app), `SessionBridge` notifies the linked conversation: "Session ended." and removes the link.

## Hot Config Reload

When the user changes messaging settings in the Settings UI (bot token, enable/disable, allowed chats), the adapter must react without requiring an app restart.

### Mechanism

`MessagingService` subscribes to config changes via `StorageService` (or a simple callback from the router's `configurePlatform`/`togglePlatform` handlers). On change:

1. **Toggle enabled** -> start or stop the adapter
2. **Token changed** -> stop the running adapter, start a new one with the new token
3. **Allowed chats changed** -> restart the adapter (grammY middleware is set at `bot.use()` time, so the bot must be recreated)

```typescript
class MessagingService {
  async onConfigChanged(platformId: string): Promise<void> {
    const config = this.loadConfig(platformId);
    const adapter = this.registry.get(platformId);
    if (!adapter) return;

    if (!config.enabled) {
      if (adapter.isRunning()) await this.stopAdapter(adapter);
      return;
    }

    // Restart: stop old instance (clears all listeners), re-subscribe, start fresh
    if (adapter.isRunning()) await this.stopAdapter(adapter);
    this.subscribeToAdapter(adapter); // re-attach event listeners after stop() cleared them
    await this.startAdapter(adapter, config);
  }
}
```

The router's `configurePlatform` and `togglePlatform` handlers call `messagingService.onConfigChanged(platformId)` after persisting the new config. This makes config changes take effect immediately.

## Concurrent Input Policy

When the user types in the desktop app and sends a message via Telegram at the same time, both inputs arrive at `SessionManager.pushInput()`. Since `Pushable<SDKUserMessage>` is a serial queue, messages are processed in arrival order.

**Policy: last-write-wins, inform both sides.**

- If a remote message arrives while a turn is already in progress, it queues behind the current turn (normal behavior).
- If both a desktop and remote message arrive between turns, they execute sequentially in arrival order.
- The `source` field on each message (see "Remote message source attribution") lets both the desktop UI and the messaging platform see who sent what. No special conflict resolution needed — this is the same model as having two browser tabs open.

## Telegram Markdown Formatting

### The problem

Telegram's legacy `Markdown` parse mode is deprecated. `MarkdownV2` is current but requires escaping special characters: `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`. AI output is full of these.

### Solution (`platforms/telegram/markdown.ts`)

````typescript
/**
 * Convert standard markdown (from AI output) to Telegram MarkdownV2.
 *
 * Strategy:
 * - Preserve code blocks (``` and `) — content inside is only escaped for backtick
 * - Escape all special chars in regular text
 * - Convert **bold** to *bold*, _italic_ stays
 * - Strip unsupported markdown features (tables, HTML)
 */
function toTelegramMarkdownV2(text: string): string;
````

### Platform-agnostic formatter (`formatters.ts`)

The `SessionBridge` formats AI events into generic markdown. Each platform adapter then has its own final formatting pass:

- Telegram: `toTelegramMarkdownV2()`
- WeChat (future): strip markdown to plain text (WeChat doesn't support markdown in bot messages)
- DingTalk (future): DingTalk's own markdown subset

The adapter interface gains no extra method — each adapter calls its formatter inside `sendMessage`/`editMessage` before hitting the API.

## Telegram Adapter (grammY-based)

```typescript
class TelegramAdapter implements MessagingPlatformAdapter {
  readonly id = "telegram";
  readonly displayName = "Telegram";
  readonly maxMessageLength = 4096;

  private bot: Bot | null = null;
  private emitter = new EventEmitter();
  private pairingMode = false;

  async start(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);

    if (this.pairingMode) {
      // In pairing mode: accept /start from any chat, emit pairing-request
      this.bot.command("start", (ctx) => {
        this.emitter.emit("pairing-request", {
          chatId: String(ctx.chat.id),
          senderId: String(ctx.from?.id),
          username: ctx.from?.username,
          chatTitle: ctx.chat.title ?? ctx.from?.first_name,
        });
        ctx.reply("Pairing request sent to Neovate. Please approve from the desktop app.");
      });
    } else {
      // Normal mode: auth guard + full handler set
      this.bot.use(authMiddleware(config.allowedChatIds));

      this.bot.on("message:text", (ctx) => {
        this.emitter.emit("message", toInboundMessage(ctx));
      });

      this.bot.on("callback_query:data", (ctx) => {
        ctx.answerCallbackQuery();
        this.emitter.emit("callback", toCallbackMessage(ctx));
      });

      await this.bot.api.setMyCommands([...COMMANDS]);
    }

    // Start long polling (non-blocking, runs in background)
    this.bot.start({ onStart: () => log("Telegram bot started") });
  }

  async stop() {
    await this.bot?.stop();
    this.bot = null;
    this.emitter.removeAllListeners(); // contract: no events after stop()
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  async sendMessage(msg: OutboundMessage): Promise<string> {
    const text = toTelegramMarkdownV2(msg.text);
    const result = await this.bot!.api.sendMessage(msg.ref.chatId, text, {
      message_thread_id: msg.ref.threadId ? Number(msg.ref.threadId) : undefined,
      parse_mode: "MarkdownV2",
      reply_markup: msg.inlineActions ? buildInlineKeyboard(msg.inlineActions) : undefined,
    });
    return String(result.message_id);
  }

  async editMessage(
    ref: ConversationRef,
    messageId: string,
    text: string,
    actions?: InlineAction[],
  ) {
    const formatted = toTelegramMarkdownV2(text);
    await this.bot!.api.editMessageText(ref.chatId, Number(messageId), formatted, {
      parse_mode: "MarkdownV2",
      reply_markup: actions ? buildInlineKeyboard(actions) : undefined,
    });
  }

  async deleteMessage(ref: ConversationRef, messageId: string) {
    await this.bot!.api.deleteMessage(ref.chatId, Number(messageId));
  }

  async sendFile(ref: ConversationRef, content: Buffer, filename: string, caption?: string) {
    const result = await this.bot!.api.sendDocument(ref.chatId, new InputFile(content, filename), {
      message_thread_id: ref.threadId ? Number(ref.threadId) : undefined,
      caption: caption ? toTelegramMarkdownV2(caption) : undefined,
      parse_mode: caption ? "MarkdownV2" : undefined,
    });
    return String(result.message_id);
  }

  async sendTypingIndicator(ref: ConversationRef) {
    await this.bot!.api.sendChatAction(ref.chatId, "typing", {
      message_thread_id: ref.threadId ? Number(ref.threadId) : undefined,
    });
  }

  enterPairingMode(): void {
    this.pairingMode = true;
  }
  exitPairingMode(): void {
    this.pairingMode = false;
  }

  on(event: string, handler: Function) {
    this.emitter.on(event, handler);
  }
}
```

Auth middleware checks `ctx.chat.id` against `allowedChatIds`. Unauthorized chats get a polite rejection.

## Integration Points

### What we add

1. **Contract**: `messaging: messagingContract` in `src/shared/contract.ts`
2. **Router**: `messagingRouter` in `src/main/router.ts`
3. **AppContext**: `messagingService: MessagingService` in router.ts AppContext type
4. **Bootstrap** in `index.ts`:

   ```typescript
   const messagingService = new MessagingService(
     configStore,
     sessionManager,
     projectStore,
     mainApp.getStorage(),
   );
   messagingService.registerAdapter(new TelegramAdapter());

   // After mainApp.start() -- fire-and-forget, must not block window creation
   void messagingService.startEnabledAdapters();
   ```

5. **Cleanup** in before-quit handler:
   ```typescript
   // Send "going offline" to all linked conversations, then stop adapters
   await messagingService.notifyShutdown();
   await messagingService.stopAll();
   ```
6. **Settings UI**: "Messaging" section in settings panel with pairing flow

### What we DON'T change

- **SessionManager** -- subscribe to `eventPublisher`, call existing public methods. No modifications to session logic.
- **ConfigStore** -- messaging config stored via `StorageService` in dedicated namespace, not the discriminated-union config contract. Bot tokens encrypted via `safeStorage`.
- **Plugin system** -- this is a feature, not a plugin. Wired directly in index.ts like other features.

## Error Handling

- **Adapter start failure** (bad token, network) -> MessagingService catches, marks platform as `error` state, emits status event -> Settings UI shows red indicator. App startup is NOT blocked.
- **Polling interruption** -> grammY auto-reconnects; persistent failure emits `error` event, bridge notifies linked conversations if possible
- **Session not found** -> reply to user: "Session expired. Use /chats"
- **Rate limiting** -> grammY's `auto-retry` plugin handles Telegram 429s transparently
- **MarkdownV2 parse failure** -> catch `400 Bad Request`, retry with plain text (no parse_mode) as fallback
- **safeStorage unavailable** -> fall back to plaintext storage, show warning in Settings UI
- **Invalid token on restart** -> adapter fails to start, marked as `error` state, Settings UI shows "Invalid token" with re-configure option. Does not affect other adapters or app startup.

## Dependencies

- `grammy` -- Telegram Bot API framework (only dependency for Telegram adapter)
- No other new production dependencies

## Future Platform Adapters

To add WeChat or DingTalk:

1. Create `src/main/features/messaging/platforms/wechat/` (or `dingtalk/`)
2. Implement `MessagingPlatformAdapter` interface (including `maxMessageLength`, `deleteMessage`, `sendFile`, `sendTypingIndicator`)
3. Add platform-specific markdown formatter (or plain-text stripper)
4. Add platform-specific config schema in `platform-config.ts`
5. Add platform-specific pairing flow (WeChat QR scan, DingTalk org auth, etc.)
6. Register adapter in `index.ts`: `messagingService.registerAdapter(new WeChatAdapter())`
7. Add platform card in `messaging-settings.tsx`

No changes to MessagingService, SessionBridge, CommandHandler, OutputBatcher, or LinkStore.

## Known Limitations (v1)

### Not yet implemented (designed but deferred)

- **Source attribution**: The design specifies a `source?: { platform, sender }` field on `SDKUserMessage` and a "via Telegram" badge in the desktop renderer. Not implemented — requires renderer changes to the chat message component.
- **Redaction mode**: Optional regex-based secret masking (`redactSecrets` toggle) is a v2 feature.

### Desktop-side sync gaps

- **Session list refresh**: Sessions created from Telegram don't appear in the desktop sidebar until the next project switch or app restart. The renderer's session list is loaded via `listSessions()` in a useEffect triggered by project path changes — no real-time push mechanism exists for externally-created sessions.
- **User message visibility**: Messages sent from Telegram are processed by `SessionManager.send()` and produce AI responses, but the user message itself does not appear in the desktop chat UI. The renderer adds user messages to local state before calling `send()` — messages originating from external sources bypass this local state update. The AI response IS visible in the desktop if the user has that session open.
