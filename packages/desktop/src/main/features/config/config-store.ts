import Store from "electron-store";
import os from "node:os";
import path from "node:path";

import type { AppConfig } from "../../../shared/features/config/types";

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

// TODO: migrate to StorageService — this predates the unified storage layer
export class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: "config",
      cwd: path.join(os.homedir(), ".neovate-desktop"),
      defaults: DEFAULT_CONFIG,
    });
  }

  getAll(): AppConfig {
    // Use spread to get all values with defaults applied
    return { ...DEFAULT_CONFIG, ...this.store.store };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value);
  }
}
