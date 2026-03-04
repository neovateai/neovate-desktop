import { useStore } from "zustand";
import { shallow } from "zustand/shallow";
import type { SettingsSchema } from "../../../../shared/features/settings/schema";
import type { ISettingsService, IScopedSettings } from "../../core/types";
import { createSettingsStore, type SettingsStore, type SettingsState } from "./store";

const FLUSH_DELAY = 500;

export interface SettingsServiceOptions {
  load: () => Promise<Record<string, unknown>>;
  save: (data: Record<string, unknown>) => void;
}

export class SettingsService implements ISettingsService {
  readonly store: SettingsStore;
  private readonly save: SettingsServiceOptions["save"];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private dirty = false;

  constructor(private readonly options: SettingsServiceOptions) {
    this.store = createSettingsStore();
    this.save = options.save;
  }

  async hydrate(): Promise<void> {
    const data = await this.options.load();
    this.store.setState(data);
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

  private flush(): void {
    this.flushTimer = null;
    if (this.dirty) {
      this.dirty = false;
      this.save(this.store.getState());
    }
  }

  scoped<K extends string & keyof SettingsSchema>(
    namespace: K,
  ): IScopedSettings<SettingsSchema[K]> {
    return new ScopedSettings(this.store, namespace) as IScopedSettings<SettingsSchema[K]>;
  }

  useStore<T>(selector: (state: SettingsState) => T): T {
    return useStore(this.store, selector);
  }

  dispose(): void {
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
    );
  }
}
