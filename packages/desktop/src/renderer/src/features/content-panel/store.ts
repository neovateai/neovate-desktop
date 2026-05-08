import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";

import type { ProjectTabState, ContentPanelStoreState } from "./types";

const EMPTY_PROJECT: ProjectTabState = { tabs: [], activeTabId: null };

export function createContentPanelStore() {
  return createStore<ContentPanelStoreState>()(
    immer((set, get) => ({
      projects: {},

      addTab(projectPath, tab, activate = true) {
        set((s) => {
          if (!s.projects[projectPath]) s.projects[projectPath] = { tabs: [], activeTabId: null };
          s.projects[projectPath].tabs.push(tab);
          if (activate) s.projects[projectPath].activeTabId = tab.id;
        });
      },

      removeTab(projectPath, tabId) {
        set((s) => {
          const project = s.projects[projectPath];
          if (!project) return;
          const idx = project.tabs.findIndex((t) => t.id === tabId);
          if (idx === -1) return;
          project.tabs.splice(idx, 1);
          if (project.activeTabId === tabId) {
            const prev = project.tabs[Math.max(0, idx - 1)];
            project.activeTabId = prev?.id ?? null;
          }
        });
      },

      setActiveTab(projectPath, tabId) {
        set((s) => {
          const project = s.projects[projectPath];
          if (project) project.activeTabId = tabId;
        });
      },

      updateTabState(projectPath, tabId, patch) {
        set((s) => {
          const tab = s.projects[projectPath]?.tabs.find((t) => t.id === tabId);
          if (!tab) return;
          Object.assign(tab.state, patch);
        });
      },

      getTab(projectPath, tabId) {
        return get().projects[projectPath]?.tabs.find((t) => t.id === tabId);
      },

      getProjectState(projectPath) {
        return get().projects[projectPath] ?? EMPTY_PROJECT;
      },

      findTabByViewType(projectPath, viewType) {
        return get().projects[projectPath]?.tabs.find((t) => t.viewType === viewType);
      },

      reorderTabs(projectPath, tabIds) {
        set((s) => {
          const project = s.projects[projectPath];
          if (!project || tabIds.length !== project.tabs.length) return;
          const tabMap = new Map(project.tabs.map((t) => [t.id, t]));
          const reordered = tabIds.map((id) => tabMap.get(id)).filter((t) => t != null);
          if (reordered.length !== project.tabs.length) return;
          project.tabs = reordered;
        });
      },

      removeProject(projectPath) {
        set((s) => {
          delete s.projects[projectPath];
        });
      },
    })),
  );
}
