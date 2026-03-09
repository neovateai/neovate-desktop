import debug from "debug";
import { useCallback, useEffect, useRef } from "react";

import { claudeCodeChatManager } from "../chat-manager";
import { useAgentStore } from "../store";

const loadLog = debug("neovate:agent-load-session");

export function useLoadSession(fallbackCwd?: string) {
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const createSession = useAgentStore((s) => s.createSession);
  const removeSession = useAgentStore((s) => s.removeSession);
  const setAvailableCommands = useAgentStore((s) => s.setAvailableCommands);
  const setAvailableModels = useAgentStore((s) => s.setAvailableModels);

  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const { agentSessions } = useAgentStore.getState();

      // Already loaded in v2 manager — just switch
      if (claudeCodeChatManager.getChat(sessionId)) {
        loadLog("already loaded sid=%s, switching", sessionId.slice(0, 8));
        setActiveSession(sessionId);
        return;
      }

      loadAbortRef.current?.abort();
      const ac = new AbortController();
      loadAbortRef.current = ac;

      const info = agentSessions.find((s) => s.sessionId === sessionId);
      const cwd = info?.cwd ?? fallbackCwd;
      if (!cwd) {
        throw new Error(`No cwd available for session ${sessionId}`);
      }
      loadLog("START sid=%s cwd=%s", sessionId.slice(0, 8), cwd);
      const t0 = performance.now();

      loadLog(
        "info=%o",
        info ? { title: info.title, cwd: info.cwd } : "not found in agentSessions",
      );

      try {
        const { commands, models } = await claudeCodeChatManager.loadSession(sessionId, cwd);

        // Register in old store AFTER chat is created in manager,
        // so React render finds getChat() ready before useClaudeCodeChat runs
        createSession(
          sessionId,
          info ? { title: info.title, createdAt: info.createdAt, cwd: info.cwd } : undefined,
        );

        if (commands?.length) {
          setAvailableCommands(sessionId, commands);
        }
        if (models?.length) {
          setAvailableModels(sessionId, models);
        }

        loadLog("DONE sid=%s in %dms", sessionId.slice(0, 8), Math.round(performance.now() - t0));
      } catch (error) {
        if (ac.signal.aborted) return;
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
    [
      setActiveSession,
      createSession,
      removeSession,
      setAvailableCommands,
      setAvailableModels,
      fallbackCwd,
    ],
  );

  return loadSession;
}
