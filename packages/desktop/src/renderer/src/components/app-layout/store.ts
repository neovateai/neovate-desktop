import debug from "debug";
import { useStore } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import type { PanelId, PanelMap, PanelState } from "./types";

const log = debug("neovate:layout");

import { client } from "../../orpc";
import {
  openPanel,
  collapsePanel,
  computeMinWindowWidthWithPanel,
  setPanelWidth,
} from "./layout-coordinator";
import { PANEL_DESCRIPTORS } from "./panel-descriptors";

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
  fullRightPanelId: string | null;
  togglePanel: (id: PanelId) => Promise<void> | void;
  startResize: (separatorIndex: number, clientX: number) => void;
  stopResize: () => void;
  setSecondarySidebarActiveView: (viewId: string) => Promise<void> | void;
  openFullRightPanel: (id: string) => void;
  closeFullRightPanel: () => void;
};

const DEFAULT_PANELS: Record<PanelId, PanelState> = {
  primarySidebar: { width: 300, collapsed: false },
  chatPanel: { width: 0, collapsed: false }, // width calculated on mount
  contentPanel: { width: 300, collapsed: true },
  secondarySidebar: { width: 240, collapsed: true, activeView: "git" },
};

/** Exported for testing. Validates and clamps persisted panel state. */
export function mergePersisted<T extends { panels: Record<PanelId, PanelState> }>(
  persisted: unknown,
  current: T,
): T {
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
    const width = desc ? Math.max(desc.min, Math.min(panel.width, desc.max)) : panel.width;

    panels[id] = {
      ...panels[id],
      width,
      collapsed: id === "chatPanel" ? false : panel.collapsed,
      ...(typeof panel.activeView === "string" ? { activeView: panel.activeView } : {}),
    };
  }

  return { ...current, panels };
}

const layoutStore = createStore<LayoutStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        panels: DEFAULT_PANELS,
        resizing: null,
        fullRightPanelId: null,

        togglePanel: async (id) => {
          const { panels } = get();
          if (!panels[id]) return;

          if (!panels[id].collapsed) {
            log("collapse panel", { id });
            set({ panels: collapsePanel(panels, id) });
            return;
          }

          // Expand window first, then open panel into the available space
          const minWidth = computeMinWindowWidthWithPanel(panels, id);
          log("expand panel, ensure min width", { id, minWidth });
          await client.window.ensureWidth({ minWidth }).catch(() => {});

          // Re-check: panel may have been toggled again during await
          set((state) => {
            if (!state.panels[id].collapsed) return state;
            return {
              panels: openPanel(state.panels, id, Math.max(window.innerWidth, minWidth)),
            };
          });
        },

        startResize: (separatorIndex, clientX) =>
          set((state) => {
            log("start resize", { separatorIndex, clientX });
            // Sync chatPanel width from DOM (it renders as flex-1, store value may drift)
            const el = document.querySelector('[data-slot="chat-panel"]');
            const chatWidth = el ? el.getBoundingClientRect().width : state.panels.chatPanel.width;
            const initialPanels = setPanelWidth(state.panels, "chatPanel", chatWidth);
            return {
              resizing: { separatorIndex, initialX: clientX, initialPanels },
            };
          }),

        stopResize: () => set({ resizing: null }),

        openFullRightPanel: (id) => {
          log("open full right panel", { id });
          set({ fullRightPanelId: id });
        },

        closeFullRightPanel: () => {
          if (!get().fullRightPanelId) return;
          log("close full right panel");
          set({ fullRightPanelId: null });
        },

        setSecondarySidebarActiveView: async (viewId) => {
          const { panels } = get();
          const sidebar = panels.secondarySidebar;
          if (!sidebar) return;

          // Toggle off: same view already open → collapse
          if (sidebar.activeView === viewId && !sidebar.collapsed) {
            log("collapse secondary sidebar (same view toggled)", { viewId });
            set({ panels: collapsePanel(panels, "secondarySidebar") });
            return;
          }

          log("set secondary sidebar view", { viewId, wasCollapsed: sidebar.collapsed });
          const wasCollapsed = sidebar.collapsed;
          let windowWidth = window.innerWidth;
          if (wasCollapsed) {
            const minWidth = computeMinWindowWidthWithPanel(panels, "secondarySidebar");
            log("secondary sidebar expanding, ensure min width", { minWidth });
            await client.window.ensureWidth({ minWidth }).catch(() => {});
            windowWidth = Math.max(window.innerWidth, minWidth);
          }

          set((state) => {
            const current = {
              ...state.panels,
              secondarySidebar: {
                ...state.panels.secondarySidebar,
                activeView: viewId,
              },
            };
            // Re-check: use fresh state for collapsed check
            return {
              panels: state.panels.secondarySidebar.collapsed
                ? openPanel(current, "secondarySidebar", windowWidth)
                : current,
            };
          });
        },
      }),
      {
        name: "neovate-layout",
        partialize: ({ panels }) => ({ panels }),
        merge: (persisted, current) => mergePersisted(persisted, current),
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
