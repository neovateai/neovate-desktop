import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

type PrimarySidebarState = { collapsed: boolean };
type ContentPanelState = { collapsed: boolean };
type SecondarySidebarState = { collapsed: boolean; activeView: string };

type LayoutPanels = {
  primarySidebar: PrimarySidebarState;
  contentPanel: ContentPanelState;
  secondarySidebar: SecondarySidebarState;
};

type LayoutStore = {
  panels: LayoutPanels;
  togglePanel: (id: keyof LayoutPanels) => void;
  setSecondarySidebarActiveView: (viewId: string) => void;
};

const layoutStore = createStore<LayoutStore>((set) => ({
  panels: {
    primarySidebar: { collapsed: false },
    contentPanel: { collapsed: true },
    secondarySidebar: { collapsed: true, activeView: "git" },
  },
  togglePanel: (id) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [id]: { ...state.panels[id], collapsed: !state.panels[id].collapsed },
      },
    })),
  setSecondarySidebarActiveView: (viewId) =>
    set((state) => {
      const sidebar = state.panels.secondarySidebar;
      if (sidebar.activeView === viewId && !sidebar.collapsed) {
        return {
          panels: {
            ...state.panels,
            secondarySidebar: { ...sidebar, collapsed: true },
          },
        };
      }
      return {
        panels: {
          ...state.panels,
          secondarySidebar: { activeView: viewId, collapsed: false },
        },
      };
    }),
}));

export const useLayoutStore = <T>(selector: (state: LayoutStore) => T) =>
  useStore(layoutStore, selector);
