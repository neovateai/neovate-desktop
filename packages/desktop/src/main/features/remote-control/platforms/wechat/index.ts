import debug from "debug";
import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import type {
  ConversationRef,
  InlineAction,
  OutboundMessage,
  PlatformConfig,
  WeChatConfig,
} from "../../../../../shared/features/remote-control/types";
import type { RemoteControlPlatformAdapter, RemoteControlPlatformEvent } from "../types";
import type { MessageItem, WeixinMessage } from "./types";

import { sendMessage, getConfig, sendTyping } from "./api";
import { performQRLogin } from "./auth";
import { uploadFileToCdn } from "./cdn";
import { DedupFilter } from "./dedup";
import { downloadMedia } from "./media";
import { extractTextBody, sendText } from "./messaging";
import { startMonitor } from "./monitor";
import { SyncCursorStore } from "./sync";
import { MessageItemType, MessageState, MessageType, TypingStatus, UploadMediaType } from "./types";

const log = debug("neovate:remote-control:wechat");

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";

function isImageFilename(filename: string): boolean {
  return /\.(jpe?g|png|gif|bmp|webp)$/i.test(filename);
}

export class WeChatAdapter implements RemoteControlPlatformAdapter {
  readonly id = "wechat";
  readonly displayName = "WeChat";
  readonly maxMessageLength = 4096;
  readonly supportsEditing = false;
  readonly supportsInlineKeyboard = false;

  private emitter = new EventEmitter();
  private running = false;
  private pairingMode = false;
  private abortController: AbortController | null = null;
  private config: WeChatConfig | null = null;

  private dedup = new DedupFilter();
  private syncCursor = new SyncCursorStore();
  private contextTokens = new Map<string, string>();
  private pendingActions = new Map<string, InlineAction[]>();

  async start(config: PlatformConfig): Promise<void> {
    const wcConfig = config as WeChatConfig;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    if (this.pairingMode) {
      log("starting in pairing mode (QR login)");
      this.running = true;
      void this.runQRLogin(wcConfig, signal);
      return;
    }

    if (!wcConfig.token) {
      throw new Error("WeChat token is required (use pairing mode to log in)");
    }

    this.config = wcConfig;
    this.running = true;
    this.dedup.start();
    this.syncCursor.init(wcConfig.syncCursor ?? "", (cursor) => {
      this.emitter.emit("config-update", { ...this.config, syncCursor: cursor });
    });
    log("started with stored token (account=%s)", wcConfig.accountId);

    void this.runWithMonitor(signal);
  }

  private async runQRLogin(wcConfig: WeChatConfig, signal: AbortSignal): Promise<void> {
    const baseUrl = wcConfig.baseUrl || DEFAULT_BASE_URL;
    try {
      const result = await performQRLogin(
        baseUrl,
        {
          onQRCode: (qrCodeData) => {
            this.emitter.emit("status", {
              platformId: this.id,
              status: "pairing",
              qrCodeData,
            });
          },
          onScanned: () => {
            this.emitter.emit("status", {
              platformId: this.id,
              status: "pairing",
              qrScanned: true,
            });
          },
          onError: (error) => {
            this.emitter.emit("error", new Error(error));
          },
        },
        signal,
      );

      this.config = {
        token: result.token,
        accountId: result.accountId,
        baseUrl: result.baseUrl,
        userId: result.userId,
        allowFrom: wcConfig.allowFrom ?? [],
        enabled: true,
      };
      this.emitter.emit("config-update", { ...this.config });
      this.pairingMode = false;

      this.dedup.start();
      // Use latest cursor from live store if available, not the stale config value
      const latestCursor = this.syncCursor.get();
      this.syncCursor.init(latestCursor || wcConfig.syncCursor || "", (cursor) => {
        this.emitter.emit("config-update", { ...this.config, syncCursor: cursor });
      });
      this.emitter.emit("status", { platformId: this.id, status: "connected" });
      void this.runWithMonitor(signal);
    } catch (err) {
      if (signal.aborted) return;
      log("QR login failed: %O", err);
      this.running = false;
      this.emitter.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

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
        // If QR login fails (user doesn't scan within 480s), runQRLogin catches
        // the error and emits error status. We don't auto-retry because QR scan
        // requires human action.
        void this.runQRLogin(this.config, signal);
        return;
      }
    }
  }

  async stop(): Promise<void> {
    log("stopping (was running=%s)", this.running);
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    this.dedup.stop();
    this.syncCursor.reset();
    this.contextTokens.clear();
    this.pendingActions.clear();
    this.config = null;
    this.emitter.removeAllListeners();
  }

  isRunning(): boolean {
    return this.running;
  }

  async sendMessage(msg: OutboundMessage): Promise<string> {
    if (!this.config) throw new Error("WeChat adapter not started");

    let text = msg.text;

    // Store inline actions for number-reply routing (list rendering handled by service layer)
    if (msg.inlineActions?.length) {
      this.pendingActions.set(msg.ref.chatId, msg.inlineActions);
    }

    if (this.dedup.isDuplicateOutbound(msg.ref.chatId, text)) {
      return randomUUID();
    }

    await sendText({
      baseUrl: this.config.baseUrl,
      token: this.config.token,
      to: msg.ref.chatId,
      text,
      contextToken: this.contextTokens.get(msg.ref.chatId),
    });
    return randomUUID();
  }

  async editMessage(
    _ref: ConversationRef,
    _messageId: string,
    _text: string,
    _actions?: InlineAction[],
  ): Promise<void> {
    // WeChat does not support message editing
  }

  async deleteMessage(_ref: ConversationRef, _messageId: string): Promise<void> {
    // WeChat does not support message deletion
  }

  async sendFile(
    ref: ConversationRef,
    content: Buffer,
    filename: string,
    _caption?: string,
  ): Promise<string> {
    if (!this.config) throw new Error("WeChat adapter not started");

    const contextToken = this.contextTokens.get(ref.chatId);
    if (!contextToken) throw new Error("No context token for this user");

    const isImage = isImageFilename(filename);
    const mediaType = isImage ? UploadMediaType.IMAGE : UploadMediaType.FILE;

    const result = await uploadFileToCdn({
      content,
      toUserId: ref.chatId,
      baseUrl: this.config.baseUrl,
      token: this.config.token,
      mediaType,
    });

    const itemType = isImage ? MessageItemType.IMAGE : MessageItemType.FILE;
    const item: MessageItem = { type: itemType };
    if (isImage) {
      item.image_item = {
        media: { encrypt_query_param: result.downloadParam, aes_key: result.aeskey },
        aeskey: result.aeskey,
      };
    } else {
      item.file_item = {
        media: { encrypt_query_param: result.downloadParam, aes_key: result.aeskey },
        file_name: filename,
      };
    }

    await sendMessage({
      baseUrl: this.config.baseUrl,
      token: this.config.token,
      body: {
        msg: {
          to_user_id: ref.chatId,
          client_id: `neovate:${Date.now()}-${randomBytes(4).toString("hex")}`,
          message_type: MessageType.BOT,
          message_state: MessageState.FINISH,
          item_list: [item],
          context_token: contextToken,
        },
      },
    });

    return randomUUID();
  }

  async sendTypingIndicator(ref: ConversationRef): Promise<void> {
    if (!this.config) return;

    const contextToken = this.contextTokens.get(ref.chatId);
    if (!contextToken) return;

    try {
      const cfg = await getConfig({
        baseUrl: this.config.baseUrl,
        token: this.config.token,
        ilinkUserId: ref.chatId,
        contextToken,
      });
      if (cfg.typing_ticket) {
        await sendTyping({
          baseUrl: this.config.baseUrl,
          token: this.config.token,
          body: {
            ilink_user_id: ref.chatId,
            typing_ticket: cfg.typing_ticket,
            status: TypingStatus.TYPING,
          },
        });
      }
    } catch {
      // Best effort
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

  private async processMessage(msg: WeixinMessage): Promise<void> {
    const senderId = msg.from_user_id ?? "";
    if (!senderId) return;

    const msgId = String(msg.message_id ?? "");

    // Layer 1: msgId dedup
    if (msgId && this.dedup.isDuplicateMsg(msgId)) {
      log("dedup skip msgId: %s", msgId);
      return;
    }

    // allowFrom filter
    if (this.config?.allowFrom?.length && !this.config.allowFrom.includes(senderId)) {
      log("blocked senderId: %s", senderId);
      return;
    }

    // Cache context token
    if (msg.context_token) {
      this.contextTokens.set(senderId, msg.context_token);
    }

    // Extract text
    const text = extractTextBody(msg.item_list);

    // Download media
    const media = await downloadMedia(msg.item_list);

    let userText = text;
    if (media.voiceText && !userText) {
      userText = media.voiceText;
    }
    if (!userText && !media.imageBase64) {
      log("empty message from %s, skipping", senderId);
      return;
    }

    // Layer 2: content dedup
    if (this.dedup.isDuplicateContent(senderId, senderId, userText)) {
      log("dedup skip content: %s", userText.slice(0, 60));
      return;
    }

    log(
      "inbound: from=%s text=%s hasImage=%s",
      senderId,
      userText.slice(0, 80),
      !!media.imageBase64,
    );

    const ref: ConversationRef = { platformId: this.id, chatId: senderId };

    // Check for numbered action selection
    const actions = this.pendingActions.get(senderId);
    this.pendingActions.delete(senderId);

    const num = Number.parseInt(userText.trim(), 10);
    if (actions && num >= 1 && num <= actions.length) {
      const action = actions[num - 1];
      this.emitter.emit("callback", {
        ref,
        senderId,
        text: action.label,
        timestamp: Date.now(),
        callbackData: action.callbackData,
      });
      return;
    }

    const images = media.imageBase64
      ? [{ base64: media.imageBase64, mimeType: media.imageMimeType ?? "image/jpeg" }]
      : undefined;

    this.emitter.emit("message", {
      ref,
      senderId,
      text: userText || "What's in this image?",
      timestamp: Date.now(),
      images,
    });
  }
}
