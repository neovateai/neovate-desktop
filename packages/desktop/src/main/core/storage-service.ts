import os from "node:os";
import path from "node:path";
import Store from "electron-store";

export interface IScopedStorage {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
}

export interface IStorageService {
  scoped(namespace: string): IScopedStorage;
  dispose(): void;
}

export class StorageService implements IStorageService {
  private static readonly BASE_DIR = path.join(os.homedir(), ".neovate-desktop");
  private instances = new Map<string, Store>();

  scoped(namespace: string): IScopedStorage {
    let store = this.instances.get(namespace);
    if (!store) {
      const dir = path.dirname(namespace);
      const name = path.basename(namespace);
      store = new Store({
        name,
        cwd: dir === "." ? StorageService.BASE_DIR : path.join(StorageService.BASE_DIR, dir),
      });
      this.instances.set(namespace, store);
    }
    return new ScopedStorage(store);
  }

  dispose(): void {
    this.instances.clear();
  }
}

class ScopedStorage implements IScopedStorage {
  constructor(private store: Store) {}

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  getAll(): Record<string, unknown> {
    return this.store.store as Record<string, unknown>;
  }
}
