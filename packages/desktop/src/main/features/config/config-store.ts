import debug from "debug";
import Store from "electron-store";

import type { AppConfig } from "../../../shared/features/config/types";
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
  locale: "en-US",
  runOnStartup: false,
  multiProjectSupport: false,
  terminalFontSize: 12,
  terminalFont: "",
  developerMode: false,

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

  // Keybindings
  keybindings: {},

  // Skills
  skillsRegistryUrls: [],
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
