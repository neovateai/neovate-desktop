import debug from "debug";
import { useCallback } from "react";

import { useProjectStore } from "../../project/store";
import { claudeCodeChatManager } from "../chat-manager";
import { useAgentStore } from "../store";

const newSessionLog = debug("neovate:agent-new-session");

/** Find any existing isNew session for the given project path. */
function findPreWarmedSession(projectPath: string): string | null {
  const { sessions } = useAgentStore.getState();
  for (const [id, session] of sessions) {
    if (session.isNew && session.cwd?.startsWith(projectPath)) {
      return id;
    }
  }
  return null;
}

export function useNewSession() {
  const createSession = useAgentStore((s) => s.createSession);
  const createBackgroundSession = useAgentStore((s) => s.createBackgroundSession);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const setAvailableCommands = useAgentStore((s) => s.setAvailableCommands);
  const setAvailableModels = useAgentStore((s) => s.setAvailableModels);
  const setCurrentModel = useAgentStore((s) => s.setCurrentModel);
  const setModelScope = useAgentStore((s) => s.setModelScope);

  const createNewSession = useCallback(
    async (cwd: string) => {
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
      const { sessionId, commands, models, currentModel, modelScope } =
        await claudeCodeChatManager.createSession(cwd);
      newSessionLog("createNewSession: created %s currentModel=%s", sessionId, currentModel);

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

      createSession(sessionId, {
        cwd: projectPath,
        isNew: true,
      });

      if (commands?.length) {
        setAvailableCommands(sessionId, commands);
      }
      if (models?.length) {
        setAvailableModels(sessionId, models);
      }
      if (currentModel) {
        setCurrentModel(sessionId, currentModel);
      }
      if (modelScope) {
        setModelScope(sessionId, modelScope);
      }

      return sessionId;
    },
    [
      createSession,
      setActiveSession,
      setAvailableCommands,
      setAvailableModels,
      setCurrentModel,
      setModelScope,
    ],
  );

  /** Pre-warm a new empty session in the background (no activation). */
  const preWarmSession = useCallback(
    async (cwd: string) => {
      const projectPath = cwd || useProjectStore.getState().activeProject?.path;
      if (!projectPath) return;

      // Already have one warming up
      if (findPreWarmedSession(projectPath)) {
        newSessionLog("preWarmSession: already have a pre-warmed session, skipping");
        return;
      }

      newSessionLog("preWarmSession: creating background session cwd=%s", cwd);
      const { sessionId, commands, models, currentModel, modelScope } =
        await claudeCodeChatManager.createSession(cwd);
      newSessionLog("preWarmSession: created %s currentModel=%s", sessionId, currentModel);

      createBackgroundSession(sessionId, {
        cwd: projectPath,
        isNew: true,
      });

      if (commands?.length) {
        setAvailableCommands(sessionId, commands);
      }
      if (models?.length) {
        setAvailableModels(sessionId, models);
      }
      if (currentModel) {
        setCurrentModel(sessionId, currentModel);
      }
      if (modelScope) {
        setModelScope(sessionId, modelScope);
      }
    },
    [
      createBackgroundSession,
      setAvailableCommands,
      setAvailableModels,
      setCurrentModel,
      setModelScope,
    ],
  );

  return { createNewSession, preWarmSession };
}
