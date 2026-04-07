import { create } from "zustand";

export type SettingsMenuId =
  | "general"
  | "agents"
  | "rules"
  | "keybindings"
  | "providers"
  | "remoteControl"
  | "about";

interface SettingsUIState {
  showSettings: boolean;
  activeTab: SettingsMenuId;
  tabChangeGuard: (() => boolean) | null;
}

interface SettingsUIActions {
  setShowSettings: (show: boolean) => void;
  setActiveTab: (tab: SettingsMenuId) => void;
  setTabChangeGuard: (guard: (() => boolean) | null) => void;
}

export const useSettingsStore = create<SettingsUIState & SettingsUIActions>()((set, get) => ({
  showSettings: false,
  activeTab: "general",
  tabChangeGuard: null,
  setShowSettings: (show) => set({ showSettings: show }),
  setActiveTab: (tab) => {
    const guard = get().tabChangeGuard;
    if (guard && !guard()) return;
    set({ activeTab: tab });
  },
  setTabChangeGuard: (guard) => set({ tabChangeGuard: guard }),
}));
