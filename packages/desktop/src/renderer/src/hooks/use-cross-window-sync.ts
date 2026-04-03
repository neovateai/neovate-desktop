import debug from "debug";
import { useEffect } from "react";

import { claudeCodeChatManager } from "../features/agent/chat-manager";
import { useAgentStore } from "../features/agent/store";
import { useConfigStore } from "../features/config/store";
import { useProjectStore } from "../features/project/store";
import { onCrossWindowMessage, type CrossWindowMessage } from "../lib/cross-window-channel";

const log = debug("neovate:cross-window-sync");

/**
 * Listens for BroadcastChannel messages from other windows (e.g., popup window)
 * and syncs the main window's state accordingly.
 */
export function useCrossWindowSync(): void {
  useEffect(() => {
    const handler = (message: CrossWindowMessage) => {
      switch (message.type) {
        case "session-created": {
          log(
            "session-created: sessionId=%s projectPath=%s",
            message.sessionId,
            message.projectPath,
          );
          // Insert a stub entry directly so the session appears immediately.
          // listSessions() races against disk persistence, so we can't rely on it.
          const { agentSessions } = useAgentStore.getState();
          if (!agentSessions.some((s) => s.sessionId === message.sessionId)) {
            useAgentStore.getState().setAgentSessions([
              {
                sessionId: message.sessionId,
                title: message.title,
                cwd: message.projectPath,
                createdAt: message.createdAt,
                updatedAt: message.createdAt,
              },
              ...agentSessions,
            ]);
          }
          break;
        }
        case "navigate-to-session": {
          log(
            "navigate-to-session: sessionId=%s projectPath=%s",
            message.sessionId,
            message.projectPath,
          );
          if (message.projectPath) {
            useProjectStore.getState().switchToProjectByPath(message.projectPath);
          }
          if (message.sessionId) {
            loadAndActivateSession(message.sessionId, message.projectPath, message.title);
          }
          break;
        }
        case "config-changed": {
          log("config-changed: key=%s", message.key);
          useConfigStore.setState({ [message.key]: message.value } as any);
          break;
        }
      }
    };

    return onCrossWindowMessage(handler);
  }, []);
}

async function loadAndActivateSession(
  sessionId: string,
  cwd: string,
  title?: string,
): Promise<void> {
  const store = useAgentStore.getState();

  // Already loaded — just activate
  if (claudeCodeChatManager.getChat(sessionId)) {
    log("loadAndActivate: already loaded, switching sid=%s", sessionId.slice(0, 8));
    store.setActiveSession(sessionId);
    return;
  }

  log("loadAndActivate: loading sid=%s cwd=%s", sessionId.slice(0, 8), cwd);
  try {
    const { commands, models, currentModel, modelScope, providerId } =
      await claudeCodeChatManager.loadSession(sessionId, cwd);

    // Find metadata from agentSessions stub (set by session-created) or use message data
    const info = store.agentSessions.find((s) => s.sessionId === sessionId);

    store.createSession(sessionId, {
      title: title ?? info?.title,
      createdAt: info?.createdAt ?? new Date().toISOString(),
      cwd,
    });

    if (commands?.length) store.setAvailableCommands(sessionId, commands);
    if (models?.length) store.setAvailableModels(sessionId, models);
    if (currentModel) store.setCurrentModel(sessionId, currentModel);
    if (modelScope) store.setModelScope(sessionId, modelScope);
    if (providerId) store.setProviderId(sessionId, providerId);

    store.setActiveSession(sessionId);
    log("loadAndActivate: done sid=%s", sessionId.slice(0, 8));
  } catch (error) {
    log(
      "loadAndActivate: failed sid=%s error=%s",
      sessionId.slice(0, 8),
      error instanceof Error ? error.message : String(error),
    );
    store.removeSession(sessionId);
  }
}
