import os from "node:os";
import path from "node:path";
import Store from "electron-store";
import type { AppConfig } from "../../../shared/features/config/types";

export class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: "config",
      cwd: path.join(os.homedir(), ".neovate-desktop"),
      defaults: {
        theme: "system",
      },
    });
  }

  getAll(): AppConfig {
    return {
      theme: this.store.get("theme"),
    };
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value);
  }
}
