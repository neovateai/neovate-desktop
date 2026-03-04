import type { IScopedStorage, IStorageService } from "./storage-service";

export interface IScopedSettings {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
}

export interface ISettingsService {
  scoped(namespace: string): IScopedSettings;
  getAllSettings(): Record<string, unknown>;
}

export class SettingsService implements ISettingsService {
  private configStore: IScopedStorage;

  constructor(storage: IStorageService) {
    this.configStore = storage.scoped("config");
  }

  scoped(namespace: string): IScopedSettings {
    return new ScopedSettings(this.configStore, namespace);
  }

  getAllSettings(): Record<string, unknown> {
    return this.configStore.get<Record<string, unknown>>("settings") ?? {};
  }
}

class ScopedSettings implements IScopedSettings {
  constructor(
    private configStore: IScopedStorage,
    private namespace: string,
  ) {}

  get<T = unknown>(key: string): T | undefined {
    return this.configStore.get<T>(`settings.${this.namespace}.${key}`);
  }

  set(key: string, value: unknown): void {
    this.configStore.set(`settings.${this.namespace}.${key}`, value);
  }

  getAll(): Record<string, unknown> {
    return this.configStore.get<Record<string, unknown>>(`settings.${this.namespace}`) ?? {};
  }
}
