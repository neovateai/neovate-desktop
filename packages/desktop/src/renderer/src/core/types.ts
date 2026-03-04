import type { Disposable } from "./disposable";
import type { I18nManager } from "./i18n";
import type { SettingsSchema } from "../../../shared/features/settings/schema";
import type { SettingsStore } from "../features/settings/store";

export interface IScopedSettings<T extends Record<string, unknown> = Record<string, unknown>> {
  get<K extends string & keyof T>(key: K): T[K] | undefined;
  set<K extends string & keyof T>(key: K, value: T[K]): void;
  getAll(): Partial<T>;
  subscribe(listener: (data: Partial<T>) => void): () => void;
}

export interface ISettingsService extends Disposable {
  readonly store: SettingsStore;
  scoped<K extends string & keyof SettingsSchema>(namespace: K): IScopedSettings<SettingsSchema[K]>;
}

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly i18nManager: I18nManager;
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly settings: ISettingsService;
}
