import debug from "debug";
import { DWClient, TOPIC_ROBOT } from "dingtalk-stream";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { basename, extname } from "node:path";

import type {
  ConversationRef,
  DingTalkConfig,
  InlineAction,
  OutboundMessage,
  PlatformConfig,
} from "../../../../../shared/features/remote-control/types";
import type { RemoteControlPlatformAdapter, RemoteControlPlatformEvent } from "../types";

import { DedupFilter } from "./dedup";
import { isImageFilename, uploadMedia } from "./media";
import { SessionWebhookStore } from "./session-webhook";
import { getAccessToken, invalidateTokenCache } from "./token";

const log = debug("neovate:remote-control:dingtalk");

interface DingTalkInboundMessage {
  msgId?: string;
  msgtype?: string;
  text?: { content?: string };
  content?: { downloadCode?: string; recognition?: string; richText?: unknown[] };
  conversationId?: string;
  conversationType?: string;
  senderId?: string;
  senderNick?: string;
  sessionWebhook?: string;
}

export class DingTalkAdapter implements RemoteControlPlatformAdapter {
  readonly id = "dingtalk";
  readonly displayName = "DingTalk";
  readonly maxMessageLength = 5000;
  readonly supportsEditing = false;
  readonly supportsInlineKeyboard = false;

  private client: DWClient | null = null;
  private emitter = new EventEmitter();
  private running = false;
  private config: DingTalkConfig | null = null;

  private dedup = new DedupFilter();
  private webhooks = new SessionWebhookStore();
  private senderByChat = new Map<string, string>();
  private pendingActions = new Map<string, InlineAction[]>();

  async start(config: PlatformConfig): Promise<void> {
    const dtConfig = config as DingTalkConfig;
    if (!dtConfig.clientId || !dtConfig.clientSecret) {
      throw new Error("DingTalk clientId and clientSecret are required");
    }
    this.config = dtConfig;

    this.client = new DWClient({
      clientId: dtConfig.clientId,
      clientSecret: dtConfig.clientSecret,
      debug: false,
      keepAlive: false,
    });

    this.dedup.start();
    this.webhooks.start();

    this.client.registerCallbackListener(TOPIC_ROBOT, async (res: any) => {
      const messageId = res.headers?.messageId;
      try {
        if (messageId) {
          this.client!.socketCallBackResponse(messageId, { success: true });
        }

        const data: DingTalkInboundMessage = JSON.parse(res.data);
        const msgId = data.msgId || messageId;

        // Layer 1: msgId dedup
        if (msgId && this.dedup.isDuplicateMsg(msgId)) {
          log("dedup skip msgId: %s", msgId);
          return;
        }

        const senderId = data.senderId || "";
        const chatId = data.conversationId || "";

        // allowFrom filter (exact match)
        if (dtConfig.allowFrom.length > 0 && !dtConfig.allowFrom.includes(senderId)) {
          log("blocked senderId: %s", senderId);
          return;
        }

        // Store session webhook
        if (data.sessionWebhook) {
          this.webhooks.store(chatId, data.sessionWebhook);
        }

        // Store sender mapping for proactive API
        if (senderId && chatId) {
          this.senderByChat.set(chatId, senderId);
        }

        // Extract text content
        const text = this.extractText(data);

        // Layer 2: content-based dedup
        if (this.dedup.isDuplicateContent(senderId, chatId, text)) {
          log("dedup skip content: %s", text.slice(0, 60));
          return;
        }

        log("inbound: from=%s chat=%s text=%s", senderId, chatId, text.slice(0, 80));

        const ref: ConversationRef = { platformId: this.id, chatId };

        // Check for numbered action selection before clearing
        const actions = this.pendingActions.get(chatId);
        // Clear pending actions on any inbound message
        this.pendingActions.delete(chatId);

        const num = Number.parseInt(text.trim(), 10);
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

        this.emitter.emit("message", {
          ref,
          senderId,
          text,
          timestamp: Date.now(),
        });
      } catch (err) {
        log("inbound handler error: %O", err);
        this.emitter.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    });

    await this.client.connect();
    this.running = true;
    log("DingTalk stream connected");
  }

  async stop(): Promise<void> {
    log("stopping (was running=%s)", this.running);
    this.running = false;
    this.dedup.stop();
    this.webhooks.stop();
    this.senderByChat.clear();
    this.pendingActions.clear();
    invalidateTokenCache();

    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // May throw if already disconnected
      }
    }
    this.client = null;
    this.config = null;
    this.emitter.removeAllListeners();
  }

  isRunning(): boolean {
    return this.running;
  }

  async sendMessage(msg: OutboundMessage): Promise<string> {
    if (!this.config) throw new Error("DingTalk adapter not started");

    let text = msg.text;

    // Store inline actions for number-reply routing (list rendering handled by service layer)
    if (msg.inlineActions && msg.inlineActions.length > 0) {
      this.pendingActions.set(msg.ref.chatId, msg.inlineActions);
    }

    // Layer 3: outbound dedup
    if (this.dedup.isDuplicateOutbound(msg.ref.chatId, text)) {
      return randomUUID();
    }

    await this.sendText(msg.ref.chatId, text);
    return randomUUID();
  }

  async editMessage(
    _ref: ConversationRef,
    _messageId: string,
    _text: string,
    _actions?: InlineAction[],
  ): Promise<void> {
    throw new Error("DingTalk does not support message editing");
  }

  async deleteMessage(_ref: ConversationRef, _messageId: string): Promise<void> {
    // DingTalk does not support bot-side message deletion for DMs
  }

  async sendFile(
    ref: ConversationRef,
    content: Buffer,
    filename: string,
    _caption?: string,
  ): Promise<string> {
    if (!this.config) throw new Error("DingTalk adapter not started");

    const mediaId = await uploadMedia(this.config, content, filename);
    if (!mediaId) {
      throw new Error(`Failed to upload media: ${filename}`);
    }

    const isImage = isImageFilename(filename);
    const msgKey = isImage ? "sampleImageMsg" : "sampleFile";
    const msgParam = isImage
      ? JSON.stringify({ photoURL: mediaId })
      : JSON.stringify({
          mediaId,
          fileName: basename(filename),
          fileType: extname(filename).slice(1) || "file",
        });

    // Try session webhook first
    const webhook = this.webhooks.get(ref.chatId);
    if (webhook) {
      try {
        await this.postJson(webhook, this.buildMediaWebhookPayload(mediaId, filename));
        return randomUUID();
      } catch {
        log("session webhook failed for media, trying proactive");
      }
    }

    // Proactive API fallback
    await this.sendProactive(ref.chatId, msgKey, msgParam);
    return randomUUID();
  }

  async sendTypingIndicator(_ref: ConversationRef): Promise<void> {
    // DingTalk has no typing indicator API for bots
  }

  enterPairingMode(): void {
    // No-op — DingTalk uses config-based auth only
  }

  exitPairingMode(): void {
    // No-op
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

  private extractText(data: DingTalkInboundMessage): string {
    const msgtype = data.msgtype || "text";
    if (msgtype === "text") return data.text?.content?.trim() || "";
    if (msgtype === "audio") return data.content?.recognition || "";
    // For picture, video, file, richText — return a placeholder
    return `[${msgtype}]`;
  }

  private async sendText(chatId: string, text: string): Promise<void> {
    // Try session webhook first
    const webhook = this.webhooks.get(chatId);
    if (webhook) {
      try {
        const hasMarkdown = /^[#*>-]|[*_`#[\]]/.test(text) || text.includes("\n");
        const body = hasMarkdown
          ? {
              msgtype: "markdown",
              markdown: {
                title:
                  text
                    .split("\n")[0]
                    .replace(/^[#*\s\->]+/, "")
                    .slice(0, 20) || "Message",
                text,
              },
            }
          : { msgtype: "text", text: { content: text } };
        await this.postJson(webhook, body);
        return;
      } catch (err) {
        log("session webhook failed for chatId=%s, trying proactive: %O", chatId, err);
      }
    }

    // Proactive API fallback
    const hasMarkdown = /^[#*>-]|[*_`#[\]]/.test(text) || text.includes("\n");
    const msgKey = hasMarkdown ? "sampleMarkdown" : "sampleText";
    const msgParam = hasMarkdown
      ? JSON.stringify({
          title:
            text
              .split("\n")[0]
              .replace(/^[#*\s\->]+/, "")
              .slice(0, 20) || "Message",
          text,
        })
      : JSON.stringify({ content: text });

    await this.sendProactive(chatId, msgKey, msgParam);
  }

  private async sendProactive(chatId: string, msgKey: string, msgParam: string): Promise<void> {
    if (!this.config) throw new Error("DingTalk adapter not started");

    const token = await getAccessToken(this.config);
    const robotCode = this.config.robotCode || this.config.clientId;

    const userId = this.senderByChat.get(chatId);
    if (!userId) throw new Error(`No sender known for chat ${chatId}`);

    const payload = {
      robotCode,
      msgKey,
      msgParam,
      userIds: [userId],
    };

    const res = await fetch("https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      log("proactive send failed: %s %s", res.status, text);
    }
  }

  private buildMediaWebhookPayload(mediaId: string, filename: string): Record<string, unknown> {
    if (isImageFilename(filename)) {
      return { msgtype: "image", image: { media_id: mediaId } };
    }
    return { msgtype: "file", file: { media_id: mediaId } };
  }

  private async postJson(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST failed: ${res.status} ${text}`);
    }
  }
}
