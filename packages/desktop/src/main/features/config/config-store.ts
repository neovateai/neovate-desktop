import debug from "debug";
import { safeStorage } from "electron";
import Store from "electron-store";

import type { AppConfig, SkillsRegistry } from "../../../shared/features/config/types";
import type { Provider } from "../../../shared/features/provider/types";

import { APP_DATA_DIR } from "../../core/app-paths";

const log = debug("neovate:config-store");

/** On-disk shape — apiKey is replaced by encryptedApiKey after migration. */
type StoredProvider = Omit<Provider, "apiKey"> & {
  apiKey?: string;
  encryptedApiKey?: string;
};

type ConfigStoreSchema = AppConfig & {
  providers: StoredProvider[];
  provider?: string;
  model?: string;
};

function encryptApiKey(provider: Provider): StoredProvider {
  if (!provider.apiKey || !safeStorage.isEncryptionAvailable()) {
    return provider;
  }
  const { apiKey, ...rest } = provider;
  return {
    ...rest,
    encryptedApiKey: safeStorage.encryptString(apiKey).toString("base64"),
  };
}

function decryptApiKey(stored: StoredProvider): Provider {
  if (typeof stored.encryptedApiKey === "string") {
    const { encryptedApiKey, ...rest } = stored;
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return {
          ...rest,
          apiKey: safeStorage.decryptString(Buffer.from(encryptedApiKey, "base64")),
        } as Provider;
      } catch {
        log("failed to decrypt apiKey for provider %s", stored.id);
      }
    }
    return { ...rest, apiKey: "" } as Provider;
  }
  // Legacy plaintext — apiKey already present (or empty)
  return stored as unknown as Provider;
}

const DEFAULT_APP_CONFIG: AppConfig = {
  // General Settings
  theme: "system",
  themeStyle: "default",
  locale: "system",
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

  private getRawProviders(): StoredProvider[] {
    return this.store.get("providers") ?? [];
  }

  /** Encrypt plaintext apiKey fields left over from before encryption was added. Must be called after app.whenReady(). */
  migrateApiKeys(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      log("migrateApiKeys: encryption not available, skipping");
      return;
    }
    const raw = this.getRawProviders();
    let migrated = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i].apiKey && !raw[i].encryptedApiKey) {
        raw[i] = encryptApiKey(raw[i] as unknown as Provider);
        migrated++;
      }
    }
    if (migrated > 0) {
      this.store.set("providers", raw);
      log("migrateApiKeys: encrypted %d provider apiKeys", migrated);
    }
  }

  getProviders(): Provider[] {
    return this.getRawProviders().map(decryptApiKey);
  }

  getProvider(id: string): Provider | undefined {
    const raw = this.getRawProviders().find((p) => p.id === id);
    return raw ? decryptApiKey(raw) : undefined;
  }

  addProvider(provider: Provider): void {
    const raw = this.getRawProviders();
    raw.push(encryptApiKey(provider));
    this.store.set("providers", raw);
    log("addProvider: id=%s name=%s baseURL=%s", provider.id, provider.name, provider.baseURL);
  }

  updateProvider(id: string, updates: Partial<Omit<Provider, "id">>): Provider {
    const raw = this.getRawProviders();
    const idx = raw.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Provider not found: ${id}`);
    const current = decryptApiKey(raw[idx]);
    const updated = { ...current, ...updates };
    raw[idx] = encryptApiKey(updated);
    this.store.set("providers", raw);
    log("updateProvider: id=%s name=%s keys=%o", id, updated.name, Object.keys(updates));
    return updated;
  }

  removeProvider(id: string): void {
    const raw = this.getRawProviders().filter((p) => p.id !== id);
    this.store.set("providers", raw);
    if (this.store.get("provider") === id) {
      this.store.delete("provider" as keyof ConfigStoreSchema);
      this.store.delete("model" as keyof ConfigStoreSchema);
      log("removeProvider: cleared global selection for id=%s", id);
    }
    log("removeProvider: id=%s remaining=%d", id, raw.length);
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
