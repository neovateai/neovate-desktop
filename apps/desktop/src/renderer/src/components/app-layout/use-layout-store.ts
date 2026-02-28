import { create } from "zustand"

type PanelState = {
  collapsed: boolean
}

type LayoutStore = {
  panels: Record<string, PanelState>
  togglePanel: (id: string) => void
}

const DEFAULT_PANELS: Record<string, PanelState> = {
  primarySidebar: { collapsed: false },
  contentPanel: { collapsed: true },
  secondarySidebar: { collapsed: true },
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  panels: DEFAULT_PANELS,
  togglePanel: (id) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [id]: { ...state.panels[id], collapsed: !state.panels[id]?.collapsed },
      },
    })),
}))
