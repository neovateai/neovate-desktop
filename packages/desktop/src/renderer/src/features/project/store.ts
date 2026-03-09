import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { Project } from "../../../../shared/features/project/types";

import { client } from "../../orpc";

type ProjectState = {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  /** projectPath → archived sessionIds */
  archivedSessions: Record<string, string[]>;
  /** projectPath → pinned sessionIds */
  pinnedSessions: Record<string, string[]>;

  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  archiveSession: (projectPath: string, sessionId: string) => void;
  togglePinSession: (projectPath: string, sessionId: string) => void;
  loadSessionPreferences: (projectPath: string) => Promise<void>;
};

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    projects: [],
    activeProject: null,
    loading: false,
    archivedSessions: {},
    pinnedSessions: {},

    setProjects: (projects) => set({ projects }),
    setActiveProject: (activeProject) => set({ activeProject }),
    setLoading: (loading) => set({ loading }),
    archiveSession: (projectPath, sessionId) => {
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
    loadSessionPreferences: async (_projectPath) => {
      const [archived, pinned] = await Promise.all([
        client.project.getArchivedSessions(),
        client.project.getPinnedSessions(),
      ]);
      set((state) => {
        state.archivedSessions = archived;
        state.pinnedSessions = pinned;
      });
    },
  })),
);
