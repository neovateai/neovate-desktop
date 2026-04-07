/**
 * Typed BroadcastChannel wrapper for cross-window communication.
 * Each BrowserWindow runs its own renderer process with independent stores.
 * This channel enables sync between the main window and popup window.
 */
import debug from "debug";

const log = debug("neovate:cross-window");

export type CrossWindowMessage =
  | {
      type: "session-created";
      sessionId: string;
      projectPath: string;
      createdAt: string;
      title?: string;
    }
  | { type: "navigate-to-session"; sessionId: string; projectPath: string; title?: string }
  | { type: "project-switched"; projectPath: string }
  | { type: "config-changed"; key: string; value: unknown };

const CHANNEL_NAME = "neovate:cross-window";

type MessageHandler = (message: CrossWindowMessage) => void;

let channel: BroadcastChannel | null = null;
const listeners = new Set<MessageHandler>();

function ensureChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<CrossWindowMessage>) => {
      log("received: %s", event.data.type);
      for (const handler of listeners) {
        handler(event.data);
      }
    };
  }
  return channel;
}

export function postCrossWindowMessage(message: CrossWindowMessage): void {
  log("posting: %s", message.type);
  ensureChannel().postMessage(message);
}

export function onCrossWindowMessage(handler: MessageHandler): () => void {
  ensureChannel();
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
