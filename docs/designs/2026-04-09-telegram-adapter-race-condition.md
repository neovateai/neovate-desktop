# Fix Telegram Adapter Race Condition

**Date:** 2026-04-09
**Status:** Approved
**Log file:** `mingdong2.2026-04-09(1).log`
**Scope:** Telegram adapter only — DingTalk (`await connect()`, blocking) and WeChat (sets `running` early already) don't have this bug.

## Problem

When the Telegram adapter starts, `TelegramAdapter.start()` calls `this.bot.start()` (grammY long-polling), which is **non-blocking**. The `running` flag is only set to `true` inside the `onStart` callback, which fires later when the first poll completes.

This creates two bugs:

1. **`testConnection()` returns "Adapter is not running"** — because `isRunning()` is `false` during the gap between `start()` returning and `onStart` firing.
2. **Duplicate bot instances leak** — `onConfigChanged()` checks `adapter.isRunning()` before calling `stop()`. Since `running` is `false`, it skips the stop and starts a new instance while the old one still polls. The log shows 5+ overlapping `setMyCommands` calls as evidence of leaked instances.

### Log evidence

```
17:37:57 started adapter: telegram
17:38:32 started adapter: telegram    ← no stop in between
17:38:35 started adapter: telegram    ← another leak
17:38:50 started adapter: telegram    ← toggle on/off
17:38:52 started adapter: telegram    ← more leaks
17:39:12 setMyCommands ETIMEDOUT      ← multiple instances all trying
17:39:48 setMyCommands ETIMEDOUT
17:39:51 setMyCommands ETIMEDOUT
17:40:05 setMyCommands ETIMEDOUT
17:40:07 setMyCommands ETIMEDOUT
```

## Solution

Five changes across three files.

### Change 1: Extract `stopBot()` private helper in `platforms/telegram/index.ts`

The existing `stop()` does two things: tears down the bot **and** removes event listeners. The stop-guard in `start()` must only do the former — if it calls `stop()` directly, it nukes the listeners that `RemoteControlService.startAdapter()` just registered (the service registers listeners _before_ calling `adapter.start()`).

```ts
/** Tear down the bot instance only — does NOT touch event listeners. */
private async stopBot(): Promise<void> {
  log("stopping bot (was running=%s)", this.running);
  this.running = false;
  try { await this.bot?.stop(); } catch {}
  this.bot = null;
}

async stop(): Promise<void> {
  await this.stopBot();
  this.emitter.removeAllListeners();
}
```

**Why the split matters** — call sequence through `RemoteControlService.startAdapter()`:

```
service.startAdapter()
  → adapter.removeAllListeners()     // clear old listeners
  → adapter.on("message", ...)       // register NEW listeners
  → adapter.on("status", ...)        // ← .then() handler emits on this
  → await adapter.start(config)
      → if (this.bot) await this.stopBot()   // ✅ kills old bot, keeps new listeners
```

### Change 2: `TelegramAdapter.start()` in `platforms/telegram/index.ts`

```ts
async start(config: PlatformConfig): Promise<void> {
  const tgConfig = config as TelegramConfig;
  if (!tgConfig.botToken) throw new Error("Bot token is required");

  // Guard: stop any lingering bot instance before starting a new one.
  // Uses stopBot() — NOT stop() — to preserve event listeners registered by the service.
  if (this.bot) {
    await this.stopBot();
  }

  this.bot = new Bot(tgConfig.botToken);

  if (this.pairingMode) {
    this.setupPairingMode();
  } else {
    this.setupNormalMode(tgConfig);
  }

  this.bot.catch((err) => {
    log("bot error: %O", err);
    this.emitter.emit("error", err.error ?? err);
  });

  this.running = true;

  const bot = this.bot;
  bot.start({
    onStart: () => {
      log("Telegram polling established (pairing=%s)", this.pairingMode);
      // Register commands only after polling is confirmed — avoids ETIMEDOUT spam
      if (!this.pairingMode) {
        void bot.api.setMyCommands([...BOT_COMMANDS]).catch((err) => {
          log("failed to set commands: %O", err);
        });
      }
    },
  }).then(() => {
    // bot.start() resolves when polling stops (graceful or fatal).
    // Guard: skip if stop() already handled teardown — avoids double-emit.
    if (this.running) {
      this.running = false;
      this.emitter.emit("status", { platformId: this.id, status: "disconnected" });
    }
  });
}
```

What changed vs. current code:

| #   | Change                                                          | Why                                                                                                                                                                                       |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`stopBot()` / `stop()` split**                                | Stop-guard in `start()` must not remove listeners — the service registers them before calling `start()`                                                                                   |
| 2   | **Stop-guard calls `this.stopBot()`**                           | Kills old bot without nuking freshly-registered listeners                                                                                                                                 |
| 3   | **`this.running = true` before `bot.start()`**                  | Adapter is conceptually running once config is validated and bot is created                                                                                                               |
| 4   | **`.then()` on `bot.start()` sets `running = false`** (guarded) | Detects polling death — `bot.catch()` only handles per-update middleware errors, not polling loop failures. Guard with `if (this.running)` to avoid double-emit when `stop()` already ran |
| 5   | **`setMyCommands` moved to `onStart` callback**                 | Only fires once polling is established — eliminates ETIMEDOUT spam from leaked instances hitting unreachable API                                                                          |

### Change 2: Remove `setMyCommands` from `setupNormalMode()`

In `setupNormalMode()`, delete the `setMyCommands` call (it's now in `onStart`):

```ts
private setupNormalMode(config: TelegramConfig): void {
  if (!this.bot) return;
  log("normal mode: %d allowed chats", config.allowedChatIds.length);

  if (config.allowedChatIds.length > 0) {
    this.bot.use(authMiddleware(config.allowedChatIds));
  }

  this.bot.on("message:text", (ctx) => {
    this.emitter.emit("message", toInboundMessage(ctx));
  });

  this.bot.on("callback_query:data", (ctx) => {
    void ctx.answerCallbackQuery();
    this.emitter.emit("callback", toCallbackMessage(ctx));
  });

  // setMyCommands removed — now called in onStart callback after polling is confirmed
}
```

### Change 3: Add optional `testConnection()` to the adapter interface

The current `testConnection()` in `RemoteControlService` just checks a boolean. Adding platform-specific verification to the adapter keeps the service clean and avoids leaking grammY imports into the service layer.

**`platforms/types.ts`** — add optional method to interface:

```ts
export interface RemoteControlPlatformAdapter {
  // ... existing methods ...

  /** Optional: actively verify the connection (e.g. call getMe for Telegram). */
  testConnection?(): Promise<{ ok: boolean; error?: string; botUsername?: string }>;
}
```

**`platforms/telegram/index.ts`** — implement using existing bot instance:

```ts
async testConnection(): Promise<{ ok: boolean; error?: string; botUsername?: string }> {
  if (!this.bot) return { ok: false, error: "Bot not started" };
  try {
    const me = await this.bot.api.getMe();
    return { ok: true, botUsername: me.username };
  } catch (err) {
    return { ok: false, error: `Cannot reach Telegram API: ${(err as Error).message}` };
  }
}
```

**`remote-control-service.ts`** — delegate to adapter when available:

```ts
async testConnection(
  platformId: string,
): Promise<{ ok: boolean; error?: string; botUsername?: string }> {
  const config = this.loadConfig(platformId);
  if (!config) return { ok: false, error: "No configuration found" };

  const adapter = this.registry.get(platformId);
  if (!adapter) return { ok: false, error: "Unknown platform" };

  if (!adapter.isRunning()) {
    return { ok: false, error: "Adapter is not running" };
  }

  // Delegate to adapter-specific verification if available
  if (adapter.testConnection) {
    try {
      return await adapter.testConnection();
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  return { ok: true };
}
```

### No other changes needed in `RemoteControlService`

The existing `onConfigChanged()` logic already does stop-before-restart when `adapter.isRunning()` returns true. With the fix, the flag is accurate, so the logic works correctly.

## Testing

- Toggle Telegram on/off rapidly in settings → only one `"Telegram polling established"` per start in logs, no duplicate `setMyCommands` calls
- `testConnection()` returns `{ ok: true, botUsername: "..." }` immediately after enabling
- Explicit `stop()` → no duplicate `"disconnected"` event (`.then()` guard skips because `running` is already `false`)
- Kill network → polling stops → `.then()` fires → `isRunning()` returns `false`, status becomes "disconnected"
- Unreachable `api.telegram.org` (GFW) → no `setMyCommands` ETIMEDOUT spam (it only fires after polling succeeds)

## Out of scope

- Proxy config for China users who can't reach `api.telegram.org` — separate feature.
