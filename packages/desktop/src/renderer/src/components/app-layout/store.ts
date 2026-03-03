import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { PanelId, PanelMap, PanelState } from "./types";
import { PANEL_DESCRIPTORS } from "./panel-descriptors";
import {
  openPanel,
  collapsePanel,
  computeMinWindowWidthWithPanel,
  setPanelWidth,
} from "./layout-coordinator";
import { client } from "../../orpc";

function isPanelId(id: string, panels: Record<PanelId, PanelState>): id is PanelId {
  return Object.prototype.hasOwnProperty.call(panels, id);
}

type ResizeState = {
  separatorIndex: number;
  initialX: number;
  initialPanels: PanelMap;
};

type LayoutStore = {
  panels: Record<PanelId, PanelState>;
  resizing: ResizeState | null;
  togglePanel: (id: PanelId) => Promise<void> | void;
  startResize: (separatorIndex: number, clientX: number) => void;
  stopResize: () => void;
  setSecondarySidebarActiveView: (viewId: string) => Promise<void> | void;
};

const DEFAULT_PANELS: Record<PanelId, PanelState> = {
  primarySidebar: { width: 300, collapsed: false },
  chatPanel: { width: 0, collapsed: false }, // width calculated on mount
  contentPanel: { width: 300, collapsed: true },
  secondarySidebar: { width: 240, collapsed: true, activeView: "git" },
};

const layoutStore = createStore<LayoutStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        panels: DEFAULT_PANELS,
        resizing: null,

        togglePanel: async (id) => {
          const { panels } = get();
          if (!panels[id]) return;

          if (!panels[id].collapsed) {
            set({ panels: collapsePanel(panels, id) });
            return;
          }

          // Expand window first, then open panel into the available space
          // Use Math.max because window.innerWidth may not reflect the new size yet
          const minWidth = computeMinWindowWidthWithPanel(panels, id);
          await client.window.ensureWidth({ minWidth });
          set((state) => ({
            panels: openPanel(state.panels, id, Math.max(window.innerWidth, minWidth)),
          }));
        },

        startResize: (separatorIndex, clientX) =>
          set((state) => {
            // Sync chatPanel width from DOM (it renders as flex-1, store value may drift)
            const el = document.querySelector('[data-slot="chat-panel"]');
            const chatWidth = el ? el.getBoundingClientRect().width : state.panels.chatPanel.width;
            const initialPanels = setPanelWidth(state.panels, "chatPanel", chatWidth);
            return {
              resizing: { separatorIndex, initialX: clientX, initialPanels },
            };
          }),

        stopResize: () => set({ resizing: null }),

        setSecondarySidebarActiveView: async (viewId) => {
          const { panels } = get();
          const sidebar = panels.secondarySidebar;
          if (!sidebar) return;

          // Toggle off: same view already open → collapse
          if (sidebar.activeView === viewId && !sidebar.collapsed) {
            set({ panels: collapsePanel(panels, "secondarySidebar") });
            return;
          }

          let windowWidth = window.innerWidth;
          if (sidebar.collapsed) {
            // Expand window first, then open panel
            const minWidth = computeMinWindowWidthWithPanel(panels, "secondarySidebar");
            await client.window.ensureWidth({ minWidth });
            windowWidth = Math.max(window.innerWidth, minWidth);
          }

          set((state) => {
            const current = {
              ...state.panels,
              secondarySidebar: { ...state.panels.secondarySidebar, activeView: viewId },
            };
            return {
              panels: sidebar.collapsed
                ? openPanel(current, "secondarySidebar", windowWidth)
                : current,
            };
          });
        },
      }),
      {
        name: "neovate-layout",
        partialize: (state) => ({ panels: state.panels }),
        merge: (persisted, current) => {
          const stored = persisted as { panels?: Record<string, unknown> } | undefined;
          if (!stored?.panels || typeof stored.panels !== "object") return current;

          const panels = { ...current.panels };

          for (const [id, rawPanel] of Object.entries(stored.panels)) {
            if (!isPanelId(id, panels)) continue;
            if (!rawPanel || typeof rawPanel !== "object") continue;

            const panel = rawPanel as Partial<PanelState>;
            if (typeof panel.width !== "number" || !Number.isFinite(panel.width)) continue;
            if (typeof panel.collapsed !== "boolean") continue;

            // chatPanel is always visible; ignore stale zero-width snapshots
            if (id === "chatPanel" && panel.width === 0) continue;

            const desc = PANEL_DESCRIPTORS.find((d) => d.id === id);
            const width = desc
              ? Math.max(desc.min, Math.min(panel.width, desc.max))
              : panel.width;

            panels[id] = {
              ...panels[id],
              width,
              collapsed: id === "chatPanel" ? false : panel.collapsed,
              ...(typeof panel.activeView === "string" ? { activeView: panel.activeView } : {}),
            };
          }

          return { ...current, panels };
        },
      },
    ),
  ),
);

export { layoutStore };

export const useLayoutStore = <T>(selector: (state: LayoutStore) => T) =>
  useStore(layoutStore, selector);

export function usePanelState(id: PanelId) {
  const collapsed = useLayoutStore((s) => s.panels[id]?.collapsed ?? true);
  const width = useLayoutStore((s) => s.panels[id]?.width ?? 0);
  const isResizing = useLayoutStore((s) => s.resizing !== null);
  return { collapsed, width, isResizing };
}
