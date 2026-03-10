import debug from "debug";
import Store from "electron-store";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  Provider,
  ProviderConfig,
  ProjectProviderConfig,
} from "../../../shared/features/provider/types";

const log = debug("neovate:provider-store");

const PROJECTS_DIR = join(homedir(), ".neovate-desktop", "projects");

function encodeProjectPath(cwd: string): string {
  return cwd.replace(/^\//, "").replace(/\//g, "-");
}

function projectConfigPath(cwd: string): string {
  return join(PROJECTS_DIR, `${encodeProjectPath(cwd)}.json`);
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  const dir = join(filePath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

const DEFAULT_CONFIG: ProviderConfig = { providers: [] };

export class ProviderStore {
  private store: Store<ProviderConfig>;

  constructor() {
    this.store = new Store<ProviderConfig>({
      name: "providers",
      cwd: join(homedir(), ".neovate-desktop"),
      defaults: DEFAULT_CONFIG,
      serialize: (value) => JSON.stringify(value, null, 2) + "\n",
    });
  }

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
    // Clear global selection if it pointed to this provider
    if (this.store.get("provider") === id) {
      this.store.delete("provider" as keyof ProviderConfig);
      this.store.delete("model" as keyof ProviderConfig);
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
      this.store.delete("provider" as keyof ProviderConfig);
    } else if (provider !== undefined) {
      this.store.set("provider" as keyof ProviderConfig, provider as any);
    }
    if (model === null) {
      this.store.delete("model" as keyof ProviderConfig);
    } else if (model !== undefined) {
      this.store.set("model" as keyof ProviderConfig, model as any);
    }
    log("setGlobalSelection: provider=%s model=%s", provider, model);
  }

  getProjectSelection(cwd: string): ProjectProviderConfig {
    const json = readJsonFile(projectConfigPath(cwd));
    return {
      provider: json?.provider as string | undefined,
      model: json?.model as string | undefined,
    };
  }

  setProjectSelection(cwd: string, provider?: string | null, model?: string | null): void {
    const filePath = projectConfigPath(cwd);
    const existing = readJsonFile(filePath) ?? {};
    if (provider === null) {
      delete existing.provider;
    } else if (provider !== undefined) {
      existing.provider = provider;
    }
    if (model === null) {
      delete existing.model;
    } else if (model !== undefined) {
      existing.model = model;
    }
    writeJsonFile(filePath, existing);
    log("setProjectSelection: cwd=%s provider=%s model=%s", cwd, provider, model);
  }
}
