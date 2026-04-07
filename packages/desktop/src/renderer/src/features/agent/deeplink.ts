import debug from "debug";
import i18n from "i18next";

import type { DeeplinkEvent } from "../../../../shared/features/deeplink/contract";

import { toastManager } from "../../components/ui/toast";
import { useConfigStore } from "../config/store";
import { useProjectStore } from "../project/store";
import { claudeCodeChatManager } from "./chat-manager";
import { useAgentStore } from "./store";

const log = debug("neovate:deeplink");

function resolveDeeplinkSession(sessionId: string, project: string) {
  const { sessions, agentSessions } = useAgentStore.getState();

  if (sessions.has(sessionId)) {
    log("session in memory, activating: %s", sessionId.slice(0, 8));
    useAgentStore.getState().setActiveSession(sessionId);
    return;
  }

  const info = agentSessions.find((s) => s.sessionId === sessionId);
  if (!info) {
    log(
      "session not found in agentSessions: %s (loaded=%d)",
      sessionId.slice(0, 8),
      agentSessions.length,
    );
    toastManager.add({ type: "warning", title: i18n.t("deeplink.sessionNotFound") });
    return;
  }

  log("loading persisted session: %s cwd=%s", sessionId.slice(0, 8), info.cwd);
  claudeCodeChatManager
    .loadSession(sessionId, info.cwd ?? project)
    .then(({ commands, models, currentModel, modelScope, providerId }) => {
      log("session loaded, registering: %s", sessionId.slice(0, 8));
      const store = useAgentStore.getState();
      store.createSession(sessionId, {
        cwd: project,
        title: info.title,
        createdAt: info.createdAt,
        isNew: false,
      });
      if (commands?.length) store.setAvailableCommands(sessionId, commands);
      if (models?.length) store.setAvailableModels(sessionId, models);
      if (currentModel) store.setCurrentModel(sessionId, currentModel);
      if (modelScope) store.setModelScope(sessionId, modelScope);
      if (providerId) store.setProviderId(sessionId, providerId);
      const permissionMode = useConfigStore.getState().permissionMode;
      store.setPermissionMode(sessionId, permissionMode);
    })
    .catch((err) => {
      log("session load failed: %s %O", sessionId.slice(0, 8), err);
      toastManager.add({ type: "warning", title: i18n.t("deeplink.sessionLoadFailed") });
    });
}

/** Handler for `neovate://session/{id}?project={path}` */
export function createSessionDeeplinkHandler(): (event: DeeplinkEvent) => void {
  return (event) => {
    if (!event.data) {
      log("session handler: no data in event");
      return;
    }
    const { sessionId, project } = event.data as { sessionId: string; project: string };
    log("session handler: sessionId=%s project=%s", sessionId.slice(0, 8), project);

    const projectStore = useProjectStore.getState();
    const targetProject = projectStore.projects.find((p) => p.path === project);
    if (!targetProject || targetProject.pathMissing) {
      log("session handler: project not found: %s", project);
      toastManager.add({ type: "warning", title: i18n.t("deeplink.projectNotFound") });
      return;
    }

    if (projectStore.activeProject?.path !== project) {
      log(
        "session handler: switching project from %s to %s",
        projectStore.activeProject?.path,
        project,
      );
      // Reset sessionsLoaded before switching so our subscriber waits for the real reload
      useAgentStore.setState({ sessionsLoaded: false });
      projectStore.switchToProjectByPath(project);
      const unsub = useAgentStore.subscribe((state) => {
        if (state.sessionsLoaded) {
          unsub();
          resolveDeeplinkSession(sessionId, project);
        }
      });
      return;
    }

    // If sessions haven't loaded yet (cold launch), wait for them
    if (!useAgentStore.getState().sessionsLoaded) {
      log("session handler: same project, waiting for sessions to load");
      const unsub = useAgentStore.subscribe((state) => {
        if (state.sessionsLoaded) {
          unsub();
          resolveDeeplinkSession(sessionId, project);
        }
      });
      return;
    }

    log("session handler: same project, resolving directly");
    resolveDeeplinkSession(sessionId, project);
  };
}
