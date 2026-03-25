import debug from "debug";
import { useCallback } from "react";

import { layoutStore } from "../../../components/app-layout/store";
import { useProjectStore } from "../../project/store";
import { claudeCodeChatManager } from "../chat-manager";
import { findPreWarmedSession, registerSessionInStore } from "../session-utils";
import { useAgentStore } from "../store";

const newSessionLog = debug("neovate:agent-new-session");

export function useNewSession() {
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const setSessionInitError = useAgentStore((s) => s.setSessionInitError);

  const createNewSession = useCallback(
    async (cwd: string) => {
      layoutStore.getState().closeFullRightPanel();
      // Dedup guard: if any in-memory session is already new (empty), activate it
      const projectPath = cwd || useProjectStore.getState().activeProject?.path;
      if (!projectPath) return;
      const existing = findPreWarmedSession(projectPath);
      if (existing) {
        newSessionLog("createNewSession: reusing pre-warmed session %s", existing);
        setActiveSession(existing);
        return existing;
      }

      const startActiveId = useAgentStore.getState().activeSessionId;
      newSessionLog("createNewSession: creating session cwd=%s", cwd);
      const { sessionId, commands, models, currentModel, modelScope, providerId } =
        await claudeCodeChatManager.createSession(cwd);
      newSessionLog("createNewSession: created %s currentModel=%s", sessionId, currentModel);

      setSessionInitError(null);

      // Guard: if user navigated to another session during the async gap, don't steal focus
      const currentActiveId = useAgentStore.getState().activeSessionId;
      if (currentActiveId !== startActiveId && currentActiveId !== null) {
        newSessionLog(
          "createNewSession: user navigated away (was=%s now=%s), skipping activation",
          startActiveId,
          currentActiveId,
        );
        return sessionId;
      }

      registerSessionInStore(
        sessionId,
        projectPath,
        { commands, models, currentModel, modelScope, providerId },
        true,
      );

      return sessionId;
    },
    [setActiveSession, setSessionInitError],
  );

  /** Pre-warm a new empty session in the background (no activation). */
  const preWarmSession = useCallback(async (cwd: string) => {
    const projectPath = cwd || useProjectStore.getState().activeProject?.path;
    if (!projectPath) return;

    // Already have one warming up
    if (findPreWarmedSession(projectPath)) {
      newSessionLog("preWarmSession: already have a pre-warmed session, skipping");
      return;
    }

    newSessionLog("preWarmSession: creating background session cwd=%s", cwd);
    try {
      const { sessionId, commands, models, currentModel, modelScope, providerId } =
        await claudeCodeChatManager.createSession(cwd);
      newSessionLog("preWarmSession: created %s currentModel=%s", sessionId, currentModel);

      registerSessionInStore(
        sessionId,
        projectPath,
        { commands, models, currentModel, modelScope, providerId },
        false,
      );
    } catch (error) {
      newSessionLog(
        "preWarmSession: FAILED error=%s",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  return { createNewSession, preWarmSession };
}
