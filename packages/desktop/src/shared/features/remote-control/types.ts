/** Identifies a conversation location on any remote control platform */
export type ConversationRef = {
  platformId: string;
  chatId: string;
  threadId?: string;
};

/** Normalized inbound message from any remote control platform */
export type InboundMessage = {
  ref: ConversationRef;
  senderId: string;
  text: string;
  timestamp: number;
  callbackData?: string;
  /** Optional image attachments (e.g. from WeChat CDN) */
  images?: Array<{ base64: string; mimeType: string }>;
};

/** Outbound message to send to a platform */
export type OutboundMessage = {
  ref: ConversationRef;
  text: string;
  replyToMessageId?: string;
  inlineActions?: InlineAction[];
};

export type InlineAction = {
  label: string;
  callbackData: string;
};

/** Status of a registered remote control platform */
export type PlatformStatus = {
  id: string;
  displayName: string;
  enabled: boolean;
  connected: boolean;
  pairing: boolean;
  error?: string;
  /** Present when pairing is true and a request has been received */
  pairingRequest?: {
    chatId: string;
    senderId: string;
    username?: string;
    chatTitle?: string;
  };
};

/** Event emitted when platform status changes */
export type PlatformStatusEvent = {
  platformId: string;
  status: "connected" | "disconnected" | "error" | "pairing" | "pairing-request";
  error?: string;
  /** Present when status is "pairing-request" */
  pairingRequest?: {
    chatId: string;
    senderId: string;
    username?: string;
    chatTitle?: string;
  };
  /** Base64-encoded QR code image (e.g. for WeChat login) */
  qrCodeData?: string;
  /** True after user has scanned the QR code but not yet confirmed */
  qrScanned?: boolean;
};

/** Per-platform config stored via StorageService */
export type PlatformConfig = {
  enabled: boolean;
  [key: string]: unknown;
};

/** Telegram-specific platform config */
export type TelegramConfig = {
  botToken: string;
  allowedChatIds: string[];
  enabled: boolean;
};

/** DingTalk-specific platform config */
export type DingTalkConfig = {
  clientId: string;
  clientSecret: string;
  robotCode: string;
  allowFrom: string[];
  enabled: boolean;
};

/** WeChat-specific platform config (iLink Bot protocol) */
export type WeChatConfig = {
  token: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
  allowFrom: string[];
  enabled: boolean;
  syncCursor?: string;
};

/** Persisted link between a conversation and a session */
export type PersistedLink = {
  ref: ConversationRef;
  sessionId: string;
  linkedAt: number;
};

/** Source attribution for messages sent from remote control platforms */
export type MessageSource = {
  platform: string;
  sender: string;
};
