import { useCallback, useState } from "react";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";

export function useAcpConnect() {
  const [connecting, setConnecting] = useState(false);
  const createSession = useAcpStore((s) => s.createSession);

  const connect = useCallback(
    async (agentId: string, cwd?: string) => {
      setConnecting(true);
      try {
        const { connectionId } = await client.acp.connect({ agentId, cwd });
        const { sessionId } = await client.acp.newSession({
          connectionId,
          cwd,
        });
        createSession(sessionId, connectionId);
        return { connectionId, sessionId };
      } finally {
        setConnecting(false);
      }
    },
    [createSession],
  );

  return { connect, connecting };
}
