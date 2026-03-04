import { useCallback, useState } from "react";
import { ORPCError } from "@orpc/client";
import debug from "debug";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";
import { useProjectStore } from "../../project/store";

const connectLog = debug("neovate:acp-connect");

export function useAcpConnect() {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const setActiveConnectionId = useAcpStore((s) => s.setActiveConnectionId);
  const setAgentSessions = useAcpStore((s) => s.setAgentSessions);
  const addTiming = useAcpStore((s) => s.addTiming);

  const connect = useCallback(
    async (agentId: string, cwd?: string) => {
      setConnecting(true);
      setConnectError(null);
      const t0 = performance.now();
      connectLog("connect: start (agentId=%s)", agentId);
      try {
        const { connectionId } = await client.acp.connect({ agentId, cwd });
        const elapsed = Math.round(performance.now() - t0);
        connectLog("connect: success in %dms (connectionId=%s)", elapsed, connectionId);
        addTiming({
          phase: "connect",
          label: "rpc_roundtrip",
          durationMs: elapsed,
          timestamp: Date.now(),
        });
        setActiveConnectionId(connectionId);

        const listStart = performance.now();
        client.acp
          .listSessions({ connectionId })
          .then((sessions) => {
            const listElapsed = Math.round(performance.now() - listStart);
            connectLog(
              "listSessions: success in %dms (count=%d) sessions=%o",
              listElapsed,
              sessions.length,
              sessions.map((s) => ({ id: s.sessionId.slice(0, 8), cwd: s.cwd, title: s.title })),
            );
            addTiming({
              phase: "connect",
              label: "listSessions",
              durationMs: listElapsed,
              timestamp: Date.now(),
            });
            setAgentSessions(sessions);

            // Preload sessions matching the connect cwd, excluding archived
            if (cwd && sessions.length > 0) {
              const archived = new Set(useProjectStore.getState().archivedSessions[cwd] ?? []);
              const projectSessions = sessions.filter(
                (s) => s.cwd?.startsWith(cwd) && !archived.has(s.sessionId),
              );
              connectLog(
                "preload: total=%d cwdMatch=%d archived=%d final=%d cwd=%s",
                sessions.length,
                sessions.filter((s) => s.cwd?.startsWith(cwd)).length,
                archived.size,
                projectSessions.length,
                cwd,
              );
              if (projectSessions.length > 0) {
                const sessionIds = [...projectSessions]
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .map((s) => s.sessionId);
                connectLog(
                  "preload: requesting %d sessions ids=%o",
                  sessionIds.length,
                  sessionIds.map((id) => id.slice(0, 8)),
                );
                client.acp.preloadSessions({ connectionId, sessionIds, cwd }).catch(() => {});
              }
            }
          })
          .catch(() => {});

        return { connectionId };
      } catch (error) {
        const elapsed = Math.round(performance.now() - t0);
        connectLog("connect: failed after %dms", elapsed);
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
    [setActiveConnectionId, setAgentSessions, addTiming],
  );

  return { connect, connecting, connectError };
}
