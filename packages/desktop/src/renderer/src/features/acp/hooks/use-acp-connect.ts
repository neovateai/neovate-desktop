import { useCallback, useState } from "react";
import { ORPCError } from "@orpc/client";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";

export function useAcpConnect() {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const createSession = useAcpStore((s) => s.createSession);

  const connect = useCallback(
    async (agentId: string, cwd?: string) => {
      setConnecting(true);
      setConnectError(null);
      try {
        const { connectionId } = await client.acp.connect({ agentId, cwd });
        const { sessionId } = await client.acp.newSession({
          connectionId,
          cwd,
        });
        createSession(sessionId, connectionId);
        return { connectionId, sessionId };
      } catch (error) {
        const message =
          error instanceof ORPCError || error instanceof Error
            ? error.message
            : "Failed to connect to agent.";
        setConnectError(message);
        throw error;
      } finally {
        setConnecting(false);
      }
    },
    [createSession],
  );

  return { connect, connecting, connectError };
}
