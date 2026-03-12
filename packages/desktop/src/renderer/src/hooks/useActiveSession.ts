import { useAgentStore } from "../features/agent/store";

export function useActiveSession(): { sessionId: string | null } {
  const sessionId = useAgentStore((s) => s.activeSessionId);
  return { sessionId };
}
