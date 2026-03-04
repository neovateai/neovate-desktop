import os from "node:os";
import path from "node:path";
import Store from "electron-store";

const DEFAULT_BASE_DIR = path.join(os.homedir(), ".neovate-desktop");

// TODO: support generic type parameter for dot-notation type safety — scoped<T>(namespace) → Store<T>
export interface IStorageService {
  scoped(namespace: string): Store;
  dispose(): void;
}

export class StorageService implements IStorageService {
  private readonly baseDir: string;
  private instances = new Map<string, Store>();

  constructor(options: { baseDir?: string } = {}) {
    this.baseDir = options.baseDir ?? DEFAULT_BASE_DIR;
  }

  scoped(namespace: string): Store {
    if (!namespace) throw new Error("namespace must not be empty");
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(namespace)) {
      throw new Error("namespace must not contain path traversal");
    }
    let store = this.instances.get(namespace);
    if (!store) {
      const dir = path.dirname(namespace);
      const name = path.basename(namespace);
      const cwd = dir === "." ? this.baseDir : path.join(this.baseDir, dir);
      if (!path.resolve(cwd).startsWith(this.baseDir)) {
        throw new Error("namespace resolved outside base directory");
      }
      store = new Store({ name, cwd });
      this.instances.set(namespace, store);
    }
    return store;
  }

  dispose(): void {
    this.instances.clear();
  }
}
