import { create } from "zustand";

export type SettingsMenuId =
  | "general"
  | "chat"
  | "rules"
  | "skills"
  | "keybindings"
  | "providers"
  | "about"
  | "mcp";

interface SettingsUIState {
  showSettings: boolean;
  activeTab: SettingsMenuId;
}

interface SettingsUIActions {
  setShowSettings: (show: boolean) => void;
  setActiveTab: (tab: SettingsMenuId) => void;
}

export const useSettingsStore = create<SettingsUIState & SettingsUIActions>()((set) => ({
  showSettings: false,
  activeTab: "general",
  setShowSettings: (show) => set({ showSettings: show }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
