import Store from "electron-store";
import path from "node:path";

import { APP_DATA_DIR } from "./app-paths";

// TODO: support generic type parameter for dot-notation type safety — scoped<T>(namespace) → Store<T>
export interface IStorageService {
  scoped(namespace: string): Store;
  dispose(): void;
}

export class StorageService implements IStorageService {
  private readonly baseDir: string;
  private instances = new Map<string, Store>();

  constructor(options: { baseDir?: string } = {}) {
    this.baseDir = options.baseDir ?? APP_DATA_DIR;
  }

  scoped(namespace: string): Store {
    if (!namespace) throw new Error("namespace must not be empty");
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(namespace)) {
      throw new Error("namespace must not contain path traversal");
    }
    const dir = path.dirname(namespace);
    const name = path.basename(namespace);
    const cwd = dir === "." ? this.baseDir : path.join(this.baseDir, dir);
    const resolved = path.resolve(cwd);
    const relative = path.relative(this.baseDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("namespace resolved outside base directory");
    }
    const cacheKey = path.join(this.baseDir, namespace);
    let store = this.instances.get(cacheKey);
    if (!store) {
      store = new Store({
        name,
        cwd,
        serialize: (value) => JSON.stringify(value, null, 2) + "\n",
      });
      this.instances.set(cacheKey, store);
    }
    return store;
  }

  dispose(): void {
    this.instances.clear();
  }
}
