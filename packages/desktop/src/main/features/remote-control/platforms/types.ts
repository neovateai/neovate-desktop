import type {
  ConversationRef,
  InboundMessage,
  InlineAction,
  OutboundMessage,
  PlatformConfig,
} from "../../../../shared/features/remote-control/types";

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
};

export interface RemoteControlPlatformAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly maxMessageLength: number;

  // Lifecycle
  start(config: PlatformConfig): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Outbound
  sendMessage(msg: OutboundMessage): Promise<string>;
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

  // Events
  on<K extends keyof RemoteControlPlatformEvent>(
    event: K,
    handler: RemoteControlPlatformEvent[K],
  ): void;
  off<K extends keyof RemoteControlPlatformEvent>(
    event: K,
    handler: RemoteControlPlatformEvent[K],
  ): void;
  removeAllListeners(): void;

  // Pairing
  enterPairingMode(): void;
  exitPairingMode(): void;
}
