import { useCallback, useState } from "react";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";

export function useAcpConnect() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSession = useAcpStore((s) => s.createSession);

  const connect = useCallback(
    async (agentId: string, cwd?: string) => {
      setConnecting(true);
      setError(null);
      try {
        const { connectionId } = await client.acp.connect({ agentId, cwd });
        const { sessionId } = await client.acp.newSession({
          connectionId,
          cwd,
        });
        createSession(sessionId, connectionId);
        return { connectionId, sessionId };
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e && typeof e.message === "string"
            ? e.message
            : "Failed to connect to agent.";
        setError(message);
        throw e;
      } finally {
        setConnecting(false);
      }
    },
    [createSession],
  );

  return { connect, connecting, error };
}
