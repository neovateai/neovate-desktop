import { useCallback, useEffect, useRef } from "react";
import debug from "debug";
import { client } from "../../../orpc";
import { useAgentStore } from "../store";

const loadLog = debug("neovate:agent-load-session");

export function useLoadSession(activeProjectPath: string | undefined) {
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const createSession = useAgentStore((s) => s.createSession);
  const removeSession = useAgentStore((s) => s.removeSession);
  const appendChunk = useAgentStore((s) => s.appendChunk);
  const setSdkReady = useAgentStore((s) => s.setSdkReady);

  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const { sessions, agentSessions } = useAgentStore.getState();

      if (sessions.has(sessionId)) {
        loadLog("already loaded sid=%s, switching", sessionId.slice(0, 8));
        setActiveSession(sessionId);
        return;
      }

      loadAbortRef.current?.abort();
      const ac = new AbortController();
      loadAbortRef.current = ac;

      loadLog("START sid=%s cwd=%s", sessionId.slice(0, 8), activeProjectPath);
      const t0 = performance.now();

      const info = agentSessions.find((s) => s.sessionId === sessionId);
      loadLog(
        "info=%o",
        info ? { title: info.title, cwd: info.cwd } : "not found in agentSessions",
      );
      createSession(
        sessionId,
        info ? { title: info.title, createdAt: info.createdAt, cwd: info.cwd } : undefined,
      );

      try {
        const iterator = await client.agent.loadSession(
          { sessionId, cwd: activeProjectPath },
          { signal: ac.signal },
        );
        let eventCount = 0;
        for await (const event of iterator) {
          eventCount++;
          appendChunk(sessionId, event);
        }
        setSdkReady(sessionId, true);
        loadLog(
          "SDK ready sid=%s in %dms events=%d",
          sessionId.slice(0, 8),
          Math.round(performance.now() - t0),
          eventCount,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        loadLog(
          "FAILED sid=%s in %dms error=%s",
          sessionId.slice(0, 8),
          Math.round(performance.now() - t0),
          error instanceof Error ? error.message : String(error),
        );
        removeSession(sessionId);
      } finally {
        if (loadAbortRef.current === ac) {
          loadAbortRef.current = null;
        }
      }
    },
    [setActiveSession, createSession, removeSession, appendChunk, setSdkReady, activeProjectPath],
  );

  return loadSession;
}
