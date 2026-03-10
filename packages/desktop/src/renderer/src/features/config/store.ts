import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { AppConfig } from "../../../../shared/features/config/types";

import { DEFAULT_KEYBINDINGS, type KeybindingAction } from "../../lib/keybindings";
import { client } from "../../orpc";

type KeybindingsConfig = Record<KeybindingAction, string>;

interface ConfigState extends AppConfig {
  loaded: boolean;
  load: () => Promise<void>;
  // Generic setter for any config field
  setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  // Specialized setters for complex fields
  setKeybinding: (action: KeybindingAction, binding: string) => void;
  resetKeybindings: () => void;
}

const DEFAULT_CONFIG: AppConfig = {
  // General Settings
  theme: "system",
  locale: "en-US",
  runOnStartup: false,
  multiProjectSupport: false,
  terminalFontSize: 12,
  terminalFont: "",
  developerMode: false,

  // Sidebar Settings (multi-project mode)
  sidebarOrganize: "byProject",
  sidebarSortBy: "created",
  closedProjectAccordions: [],

  // Chat Settings
  sendMessageWith: "enter",
  agentLanguage: "English",
  approvalMode: "default",
  notificationSound: "default",

  // Keybindings
  keybindings: {},
};

export const useConfigStore = create<ConfigState>()(
  immer((set, get) => ({
    ...DEFAULT_CONFIG,
    loaded: false,

    load: async () => {
      const config = await client.config.get();
      set((state) => {
        Object.assign(state, config);
        state.loaded = true;
      });
    },

    // Generic setter - handles persistence automatically
    setConfig: (key, value) => {
      client.config.set({ key, value } as any).catch(() => {});
      set({ [key]: value } as any);
    },

    // Specialized setter for keybindings (nested object)
    setKeybinding: (action, binding) => {
      set((state) => {
        state.keybindings[action] = binding;
      });
      client.config.set({ key: "keybindings", value: get().keybindings }).catch(() => {});
    },

    resetKeybindings: () => {
      const keybindings = { ...DEFAULT_KEYBINDINGS } as KeybindingsConfig;
      client.config.set({ key: "keybindings", value: keybindings }).catch(() => {});
      set({ keybindings });
    },
  })),
);

// Convenience hooks for common config fields
// These provide a clean API while using the generic setter internally
export const useTheme = () => useConfigStore((s) => s.theme);
export const useLocale = () => useConfigStore((s) => s.locale);
export const useSetTheme = () => (value: AppConfig["theme"]) =>
  useConfigStore.getState().setConfig("theme", value);
export const useSetLocale = () => (value: AppConfig["locale"]) =>
  useConfigStore.getState().setConfig("locale", value);
