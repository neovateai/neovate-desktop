import debug from "debug";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

const log = debug("neovate:config");

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
  themeStyle: "default",
  locale: "system",
  runOnStartup: false,
  multiProjectSupport: false,
  appFontSize: 14,
  terminalFontSize: 12,
  terminalFont: "",
  developerMode: false,
  showSessionInitStatus: false,
  claudeCodeBinPath: "",

  // Sidebar Settings (multi-project mode)
  sidebarOrganize: "byProject",
  sidebarSortBy: "created",

  // Chat Settings
  sendMessageWith: "enter",
  agentLanguage: "English",
  permissionMode: "default",
  notificationSound: "default",
  tokenOptimization: true,
  networkInspector: false,
  keepAwake: false,
  preWarmSessions: true,
  auxiliaryModelSelection: "",

  // Keybindings
  keybindings: {},

  // Popup Window
  popupWindowEnabled: true,
  popupWindowShortcut: "Alt+N",
  popupWindowStayOpen: true,

  // Skills
  skillsRegistries: [],
  npmRegistry: "",
};

export const useConfigStore = create<ConfigState>()(
  immer((set, get) => ({
    ...DEFAULT_CONFIG,
    loaded: false,

    load: async () => {
      log("loading config");
      const config = await client.config.get();
      log("config loaded", config);
      set((state) => {
        Object.assign(state, config);
        state.loaded = true;
      });
    },

    // Generic setter - handles persistence automatically
    setConfig: (key, value) => {
      log("setConfig: key=%s", key, value);
      client.config.set({ key, value } as any).catch(() => {});
      set({ [key]: value } as any);
    },

    // Specialized setter for keybindings (nested object)
    setKeybinding: (action, binding) => {
      log("setKeybinding: action=%s binding=%s", action, binding);
      set((state) => {
        state.keybindings[action] = binding;
      });
      client.config.set({ key: "keybindings", value: get().keybindings }).catch(() => {});
    },

    resetKeybindings: () => {
      log("resetKeybindings");
      const keybindings = { ...DEFAULT_KEYBINDINGS } as KeybindingsConfig;
      client.config.set({ key: "keybindings", value: keybindings }).catch(() => {});
      set({ keybindings });
    },
  })),
);

// Convenience hooks for common config fields
export const useLocale = () => useConfigStore((s) => s.locale);
