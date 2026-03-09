import { useCallback, useSyncExternalStore } from "react";
import { claudeCodeChatManager } from "../chat-manager";

const noop = () => () => {};

export function useSessionChatStatus(sessionId: string) {
  const chat = claudeCodeChatManager.getChat(sessionId);

  const subscribe = useCallback(
    (cb: () => void) => (chat ? chat.store.subscribe(cb) : noop()),
    [chat],
  );

  const isStreaming = useSyncExternalStore(
    subscribe,
    () => chat?.store.getState().status === "streaming",
  );

  const hasPendingRequests = useSyncExternalStore(
    subscribe,
    () => (chat?.store.getState().pendingRequests.length ?? 0) > 0,
  );

  return { isStreaming, hasPendingRequests };
}
