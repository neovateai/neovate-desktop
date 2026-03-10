import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";

import type { SettingsSchema } from "../../../../shared/features/settings/schema";

// --- UI State (settings modal) ---

export type SettingsMenuId =
  | "general"
  | "chat"
  | "rules"
  | "skills"
  | "keybindings"
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

// --- Persistence Store (settings service) ---

export type SettingsState = Partial<SettingsSchema>;

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export function createSettingsStore() {
  return createStore<SettingsState>()(subscribeWithSelector(immer(() => ({}))));
}
