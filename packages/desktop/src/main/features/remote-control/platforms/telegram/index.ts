import debug from "debug";
import { Bot, InputFile } from "grammy";
import { EventEmitter } from "node:events";

import type {
  ConversationRef,
  InlineAction,
  OutboundMessage,
  PlatformConfig,
  TelegramConfig,
} from "../../../../../shared/features/remote-control/types";
import type { RemoteControlPlatformAdapter, RemoteControlPlatformEvent } from "../types";

import { authMiddleware, toCallbackMessage, toInboundMessage } from "./handlers";
import { toTelegramMarkdownV2 } from "./markdown";
import { BOT_COMMANDS, buildInlineKeyboard } from "./ui";

const log = debug("neovate:remote-control:telegram");

export class TelegramAdapter implements RemoteControlPlatformAdapter {
  readonly id = "telegram";
  readonly displayName = "Telegram";
  readonly maxMessageLength = 4096;

  private bot: Bot | null = null;
  private emitter = new EventEmitter();
  private running = false;
  private pairingMode = false;

  async start(config: PlatformConfig): Promise<void> {
    const tgConfig = config as TelegramConfig;
    if (!tgConfig.botToken) throw new Error("Bot token is required");

    this.bot = new Bot(tgConfig.botToken);

    if (this.pairingMode) {
      this.setupPairingMode();
    } else {
      this.setupNormalMode(tgConfig);
    }

    // Error handler
    this.bot.catch((err) => {
      log("bot error: %O", err);
      this.emitter.emit("error", err.error ?? err);
    });

    // Start long polling (non-blocking)
    this.bot.start({
      onStart: () => {
        log("Telegram bot started (pairing=%s)", this.pairingMode);
        this.running = true;
      },
    });
  }

  async stop(): Promise<void> {
    log("stopping bot (was running=%s)", this.running);
    this.running = false;
    try {
      await this.bot?.stop();
    } catch {
      // grammY may throw if already stopped
    }
    this.bot = null;
    this.emitter.removeAllListeners();
  }

  isRunning(): boolean {
    return this.running;
  }

  async sendMessage(msg: OutboundMessage): Promise<string> {
    if (!this.bot) throw new Error("Bot not started");

    const text = this.formatOutbound(msg.text);
    try {
      const result = await this.bot.api.sendMessage(msg.ref.chatId, text, {
        message_thread_id: msg.ref.threadId ? Number(msg.ref.threadId) : undefined,
        parse_mode: "MarkdownV2",
        reply_markup: msg.inlineActions ? buildInlineKeyboard(msg.inlineActions) : undefined,
      });
      return String(result.message_id);
    } catch (err) {
      // Fallback: send without parse_mode if MarkdownV2 fails
      log("MarkdownV2 send failed, retrying as plain text: %O", err);
      const result = await this.bot.api.sendMessage(msg.ref.chatId, msg.text, {
        message_thread_id: msg.ref.threadId ? Number(msg.ref.threadId) : undefined,
        reply_markup: msg.inlineActions ? buildInlineKeyboard(msg.inlineActions) : undefined,
      });
      return String(result.message_id);
    }
  }

  async editMessage(
    ref: ConversationRef,
    messageId: string,
    text: string,
    actions?: InlineAction[],
  ): Promise<void> {
    if (!this.bot) throw new Error("Bot not started");

    const formatted = this.formatOutbound(text);
    try {
      await this.bot.api.editMessageText(ref.chatId, Number(messageId), formatted, {
        parse_mode: "MarkdownV2",
        reply_markup: actions ? buildInlineKeyboard(actions) : undefined,
      });
    } catch (err) {
      // Fallback: plain text
      log("MarkdownV2 edit failed, retrying as plain text: %O", err);
      await this.bot.api.editMessageText(ref.chatId, Number(messageId), text, {
        reply_markup: actions ? buildInlineKeyboard(actions) : undefined,
      });
    }
  }

  async deleteMessage(ref: ConversationRef, messageId: string): Promise<void> {
    if (!this.bot) throw new Error("Bot not started");
    await this.bot.api.deleteMessage(ref.chatId, Number(messageId));
  }

  async sendFile(
    ref: ConversationRef,
    content: Buffer,
    filename: string,
    caption?: string,
  ): Promise<string> {
    if (!this.bot) throw new Error("Bot not started");

    const result = await this.bot.api.sendDocument(ref.chatId, new InputFile(content, filename), {
      message_thread_id: ref.threadId ? Number(ref.threadId) : undefined,
      caption: caption ? this.formatOutbound(caption) : undefined,
      parse_mode: caption ? "MarkdownV2" : undefined,
    });
    return String(result.message_id);
  }

  async sendTypingIndicator(ref: ConversationRef): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.api.sendChatAction(ref.chatId, "typing", {
        message_thread_id: ref.threadId ? Number(ref.threadId) : undefined,
      });
    } catch {
      // Typing indicator failures are non-critical
    }
  }

  enterPairingMode(): void {
    this.pairingMode = true;
  }

  exitPairingMode(): void {
    this.pairingMode = false;
  }

  on<K extends keyof RemoteControlPlatformEvent>(
    event: K,
    handler: RemoteControlPlatformEvent[K],
  ): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  off<K extends keyof RemoteControlPlatformEvent>(
    event: K,
    handler: RemoteControlPlatformEvent[K],
  ): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  // ── Internal ──

  private setupPairingMode(): void {
    if (!this.bot) return;

    this.bot.command("start", (ctx) => {
      this.emitter.emit("pairing-request", {
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id),
        username: ctx.from?.username,
        chatTitle: (ctx.chat as any).title ?? ctx.from?.first_name,
      });
      void ctx.reply("Pairing request sent to Neovate. Please approve from the desktop app.");
    });
  }

  private setupNormalMode(config: TelegramConfig): void {
    if (!this.bot) return;

    log("normal mode: %d allowed chats", config.allowedChatIds.length);

    // Auth guard
    if (config.allowedChatIds.length > 0) {
      this.bot.use(authMiddleware(config.allowedChatIds));
    }

    // Text messages
    this.bot.on("message:text", (ctx) => {
      this.emitter.emit("message", toInboundMessage(ctx));
    });

    // Callback queries (inline button presses)
    this.bot.on("callback_query:data", (ctx) => {
      void ctx.answerCallbackQuery();
      this.emitter.emit("callback", toCallbackMessage(ctx));
    });

    // Register commands with Telegram
    void this.bot.api.setMyCommands([...BOT_COMMANDS]).catch((err) => {
      log("failed to set commands: %O", err);
    });
  }

  private formatOutbound(text: string): string {
    try {
      return toTelegramMarkdownV2(text);
    } catch {
      // If formatting fails, escape everything conservatively
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
    }
  }
}
