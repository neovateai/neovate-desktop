import { useStore } from "zustand";

import { claudeCodeChatManager } from "../chat-manager";

export function useClaudeCodeChat(sessionId: string) {
  const chat = claudeCodeChatManager.getChat(sessionId);
  if (!chat) throw new Error(`No chat for session ${sessionId}`);

  const messages = useStore(chat.store, (state) => state.messages);
  const status = useStore(chat.store, (state) => state.status);
  const error = useStore(chat.store, (state) => state.error);
  const eventError = useStore(chat.store, (state) => state.eventError);
  const pendingRequests = useStore(chat.store, (state) => state.pendingRequests);

  return {
    id: sessionId,
    messages,
    status,
    error,
    eventError,
    pendingRequests,
    sendMessage: chat.sendMessage.bind(chat),
    respondToRequest: chat.respondToRequest,
    stop: chat.interrupt,
    clearError: chat.clearError,
  };
}
