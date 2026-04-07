import debug from "debug";
import Store from "electron-store";

import type { AppConfig, SkillsRegistry } from "../../../shared/features/config/types";
import type { Provider } from "../../../shared/features/provider/types";

import { APP_DATA_DIR } from "../../core/app-paths";

const log = debug("neovate:config-store");

type ConfigStoreSchema = AppConfig & {
  providers: Provider[];
  provider?: string;
  model?: string;
};

const DEFAULT_APP_CONFIG: AppConfig = {
  // General Settings
  theme: "system",
  themeStyle: "default",
  locale: "en-US",
  runOnStartup: false,
  multiProjectSupport: true,
  appFontSize: 15,
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

const STORE_DEFAULTS: ConfigStoreSchema = {
  ...DEFAULT_APP_CONFIG,
  providers: [],
};

export class ConfigStore {
  private store: Store<ConfigStoreSchema>;

  constructor() {
    this.store = new Store<ConfigStoreSchema>({
      name: "config",
      cwd: APP_DATA_DIR,
      defaults: STORE_DEFAULTS,
      serialize: (value) => JSON.stringify(value, null, 2) + "\n",
    });
    this.migrateRegistryUrls();
  }

  /** Migrate legacy `skillsRegistryUrls: string[]` → `skillsRegistries` */
  private migrateRegistryUrls(): void {
    const raw = this.store.store as Record<string, unknown>;
    const legacy = raw["skillsRegistryUrls"];
    if (!Array.isArray(legacy) || legacy.length === 0) return;

    const migrated: SkillsRegistry[] = legacy
      .filter((u): u is string => typeof u === "string")
      .map((url) => ({ url }));

    if (
      migrated.length > 0 &&
      (!raw["skillsRegistries"] || (raw["skillsRegistries"] as any[]).length === 0)
    ) {
      this.store.set("skillsRegistries", migrated);
      log("migrated %d legacy skillsRegistryUrls → skillsRegistries", migrated.length);
    }
    this.store.delete("skillsRegistryUrls" as keyof ConfigStoreSchema);
  }

  getAll(): AppConfig {
    const { providers, provider, model, ...config } = this.store.store;
    return { ...DEFAULT_APP_CONFIG, ...config };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value);
  }

  onChange<K extends keyof AppConfig>(key: K, cb: (newValue: AppConfig[K]) => void): () => void {
    return this.store.onDidChange(key, (newValue) => {
      cb(newValue as AppConfig[K]);
    });
  }

  // --- Provider methods ---

  getProviders(): Provider[] {
    return this.store.get("providers") ?? [];
  }

  getProvider(id: string): Provider | undefined {
    return this.getProviders().find((p) => p.id === id);
  }

  addProvider(provider: Provider): void {
    const providers = this.getProviders();
    providers.push(provider);
    this.store.set("providers", providers);
    log("addProvider: id=%s name=%s baseURL=%s", provider.id, provider.name, provider.baseURL);
  }

  updateProvider(id: string, updates: Partial<Omit<Provider, "id">>): Provider {
    const providers = this.getProviders();
    const idx = providers.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Provider not found: ${id}`);
    providers[idx] = { ...providers[idx], ...updates };
    this.store.set("providers", providers);
    log("updateProvider: id=%s name=%s keys=%o", id, providers[idx].name, Object.keys(updates));
    return providers[idx];
  }

  removeProvider(id: string): void {
    const providers = this.getProviders().filter((p) => p.id !== id);
    this.store.set("providers", providers);
    if (this.store.get("provider") === id) {
      this.store.delete("provider" as keyof ConfigStoreSchema);
      this.store.delete("model" as keyof ConfigStoreSchema);
      log("removeProvider: cleared global selection for id=%s", id);
    }
    log("removeProvider: id=%s remaining=%d", id, providers.length);
  }

  getGlobalSelection(): { provider?: string; model?: string } {
    return {
      provider: this.store.get("provider") as string | undefined,
      model: this.store.get("model") as string | undefined,
    };
  }

  onAnyChange(cb: (newValue: ConfigStoreSchema, oldValue: ConfigStoreSchema) => void): () => void {
    return this.store.onDidAnyChange((newVal, oldVal) => {
      cb(newVal as ConfigStoreSchema, oldVal as ConfigStoreSchema);
    });
  }

  setGlobalSelection(provider?: string | null, model?: string | null): void {
    if (provider === null) {
      this.store.delete("provider" as keyof ConfigStoreSchema);
    } else if (provider !== undefined) {
      this.store.set("provider" as keyof ConfigStoreSchema, provider as any);
    }
    if (model === null) {
      this.store.delete("model" as keyof ConfigStoreSchema);
    } else if (model !== undefined) {
      this.store.set("model" as keyof ConfigStoreSchema, model as any);
    }
    log("setGlobalSelection: provider=%s model=%s", provider, model);
  }
}
