import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { Project } from "../../../../shared/features/project/types";

import { client } from "../../orpc";
import { claudeCodeChatManager } from "../agent/chat-manager";
import { findPreWarmedSession, registerSessionInStore } from "../agent/session-utils";
import { useAgentStore } from "../agent/store";

type ProjectState = {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  /** projectPath → archived sessionIds */
  archivedSessions: Record<string, string[]>;
  /** projectPath → pinned sessionIds */
  pinnedSessions: Record<string, string[]>;
  closedProjectAccordions: string[];

  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  switchToProjectByPath: (projectPath: string) => void;
  archiveSession: (projectPath: string, sessionId: string, isActive?: boolean) => void;
  togglePinSession: (projectPath: string, sessionId: string) => void;
  setClosedProjectAccordions: (ids: string[]) => void;
  reorderProjects: (projectIds: string[]) => void;
  loadSessionPreferences: (projectPath: string) => Promise<void>;
};

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    projects: [],
    activeProject: null,
    loading: false,
    archivedSessions: {},
    pinnedSessions: {},
    closedProjectAccordions: [],

    setProjects: (projects) => set({ projects }),
    setActiveProject: (activeProject) => set({ activeProject }),
    setLoading: (loading) => set({ loading }),
    switchToProjectByPath: (projectPath) => {
      const { activeProject, projects } = useProjectStore.getState();
      if (activeProject?.path === projectPath) return;
      const project = projects.find((p) => p.path === projectPath);
      if (project) {
        client.project.setActive({ id: project.id }).catch(() => {});
        set({ activeProject: project });
      }
    },
    archiveSession: (projectPath, sessionId, isActive) => {
      client.project.archiveSession({ projectPath, sessionId }).catch(() => {});
      set((state) => {
        const list = state.archivedSessions[projectPath] ?? [];
        if (!list.includes(sessionId)) {
          state.archivedSessions[projectPath] = [...list, sessionId];
        }
        // Also unpin if pinned
        const pinned = state.pinnedSessions[projectPath];
        if (pinned) {
          state.pinnedSessions[projectPath] = pinned.filter((id) => id !== sessionId);
        }
      });

      // Tear down SDK subprocess + renderer chat (no-op if not loaded)
      claudeCodeChatManager.removeSession(sessionId).catch(() => {});
      useAgentStore.getState().removeSession(sessionId);

      // Replace the active session: reuse a pre-warmed one or create new
      if (isActive) {
        const preWarmed = findPreWarmedSession(projectPath);
        if (preWarmed) {
          useAgentStore.getState().setActiveSession(preWarmed);
        } else {
          claudeCodeChatManager
            .createSession(projectPath)
            .then(({ sessionId: newId, commands, models, currentModel, modelScope }) => {
              registerSessionInStore(
                newId,
                projectPath,
                { commands, models, currentModel, modelScope },
                true,
              );
            })
            .catch(() => {});
        }
      }
    },
    togglePinSession: (projectPath, sessionId) => {
      client.project.togglePinSession({ projectPath, sessionId }).catch(() => {});
      set((state) => {
        const list = state.pinnedSessions[projectPath] ?? [];
        if (list.includes(sessionId)) {
          state.pinnedSessions[projectPath] = list.filter((id) => id !== sessionId);
        } else {
          state.pinnedSessions[projectPath] = [...list, sessionId];
        }
      });
    },
    setClosedProjectAccordions: (ids) => {
      client.project.setClosedAccordions({ ids }).catch(() => {});
      set({ closedProjectAccordions: ids });
    },
    reorderProjects: (projectIds) => {
      const { projects } = useProjectStore.getState();
      const map = new Map(projects.map((p) => [p.id, p]));
      const reordered = projectIds.flatMap((id) => {
        const p = map.get(id);
        return p ? [p] : [];
      });
      set({ projects: reordered });
      client.project.reorderProjects({ projectIds }).catch(() => {});
    },
    loadSessionPreferences: async (_projectPath) => {
      const [archived, pinned, closedAccordions] = await Promise.all([
        client.project.getArchivedSessions(),
        client.project.getPinnedSessions(),
        client.project.getClosedAccordions(),
      ]);
      set((state) => {
        state.archivedSessions = archived;
        state.pinnedSessions = pinned;
        state.closedProjectAccordions = closedAccordions;
      });
    },
  })),
);
