import { shallow } from "zustand/shallow";

import type { ISettingsService, IScopedSettings } from "../../core/types";

import {
  settingsSchema,
  DEFAULT_SETTINGS,
  type SettingsSchema,
} from "../../../../shared/features/settings/schema";
import { createSettingsStore, type SettingsStore, type SettingsState } from "./store";

const FLUSH_DELAY = 500;

export interface SettingsServiceOptions {
  load: () => Promise<SettingsState>;
  save: (data: SettingsState) => Promise<void> | void;
}

export class SettingsService implements ISettingsService {
  readonly store: SettingsStore;
  private readonly _scopedCache = new Map<string, ScopedSettings<any>>();
  private readonly save: SettingsServiceOptions["save"];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private dirty = false;

  constructor(private readonly options: SettingsServiceOptions) {
    this.store = createSettingsStore();
    this.save = options.save;
  }

  // TODO: deep merge raw with DEFAULT_SETTINGS before safeParse so partial data preserves user values
  async hydrate(): Promise<void> {
    const raw = await this.options.load();
    const result = settingsSchema.safeParse(raw);
    this.store.setState(result.success ? result.data : DEFAULT_SETTINGS);
    this.observe();
  }

  private observe(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.subscribe(
      (state) => state,
      () => {
        this.dirty = true;
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => this.flush(), FLUSH_DELAY);
      },
      { equalityFn: shallow },
    );
  }

  // TODO: make flush async, await save, only clear dirty on success; make dispose async to guarantee last write lands
  private flush(): void {
    this.flushTimer = null;
    if (this.dirty) {
      this.dirty = false;
      Promise.resolve(this.save(this.store.getState())).catch(console.error);
    }
  }

  scoped<K extends string & keyof SettingsSchema>(
    namespace: K,
  ): IScopedSettings<SettingsSchema[K]> {
    let instance = this._scopedCache.get(namespace);
    if (!instance) {
      instance = new ScopedSettings(this.store, namespace);
      this._scopedCache.set(namespace, instance);
    }
    return instance as IScopedSettings<SettingsSchema[K]>;
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.unsubscribe?.();
  }
}

class ScopedSettings<T extends Record<string, unknown>> implements IScopedSettings<T> {
  constructor(
    private store: SettingsStore,
    private namespace: string,
  ) {}

  private scopedData(): T {
    return ((this.store.getState()[this.namespace] as T) ?? {}) as T;
  }

  get<K extends string & keyof T>(key: K): T[K] | undefined {
    return this.scopedData()[key];
  }

  // TODO: add runtime validation via namespace zod schema on set boundary
  set<K extends string & keyof T>(key: K, value: T[K]): void {
    this.store.setState((state) => ({
      [this.namespace]: { ...(state[this.namespace] as object), [key]: value },
    }));
  }

  getAll(): Partial<T> {
    return { ...this.scopedData() };
  }

  subscribe(listener: (data: Partial<T>) => void): () => void {
    return this.store.subscribe(
      (state) => ((state[this.namespace] as T) ?? {}) as Partial<T>,
      listener,
      { equalityFn: shallow },
    );
  }
}
