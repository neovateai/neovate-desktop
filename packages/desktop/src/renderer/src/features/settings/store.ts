import { create } from "zustand";

// Types
export type SettingsMenuId =
  | "general"
  | "chat"
  | "rules"
  | "skills"
  | "keybindings"
  | "about"
  | "mcp";

interface SettingsUIState {
  // UI State only
  showSettings: boolean;
  activeTab: SettingsMenuId;
}

interface SettingsUIActions {
  setShowSettings: (show: boolean) => void;
  setActiveTab: (tab: SettingsMenuId) => void;
}

export const useSettingsStore = create<SettingsUIState & SettingsUIActions>()((set) => ({
  // Initial State
  showSettings: false,
  activeTab: "general",

  // Actions
  setShowSettings: (show) => set({ showSettings: show }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
