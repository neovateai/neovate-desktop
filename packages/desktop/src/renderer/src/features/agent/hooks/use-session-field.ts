import type { ChatSession } from "../store";

import { useAgentStore } from "../store";

/**
 * Select a single field from a ChatSession by sessionId.
 * Only re-renders when the selected field's value changes —
 * avoids Map-wide re-renders from useAgentStore.
 */
export function useSessionField<K extends keyof ChatSession>(
  sessionId: string | null,
  field: K,
): ChatSession[K] | undefined {
  return useAgentStore((s) => {
    if (!sessionId) return undefined;
    return s.sessions.get(sessionId)?.[field];
  });
}
