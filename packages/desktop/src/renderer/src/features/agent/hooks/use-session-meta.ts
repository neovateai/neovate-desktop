import { useShallow } from "zustand/react/shallow";

import { useAgentStore } from "../store";

/**
 * Extracts scalar session metadata with shallow equality.
 * Only use in singleton components (MessageInput, InputToolbar) — not in
 * SessionItem (50 instances). For SessionItem, pass data as props.
 */
export function useSessionMeta(sessionId: string | null) {
  return useAgentStore(
    useShallow((s) => {
      if (!sessionId) return null;
      const session = s.sessions.get(sessionId);
      if (!session) return null;
      return {
        permissionMode: session.permissionMode,
        currentModel: session.currentModel,
        modelScope: session.modelScope,
        providerId: session.providerId,
        isNew: session.isNew,
        hasMessages: session.messages.length > 0,
      };
    }),
  );
}
