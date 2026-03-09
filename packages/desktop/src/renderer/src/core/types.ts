import type { SettingsSchema } from "../../../shared/features/settings/schema";
import type { ContentPanel } from "../features/content-panel/content-panel";
import type { SettingsStore } from "../features/settings/store";
import type { Disposable, Unsubscribe } from "./disposable";
import type { I18nManager } from "./i18n";

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

export interface IWorkbench {
  readonly contentPanel: ContentPanel;
}

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly i18nManager: I18nManager;
  readonly subscriptions: {
    push(...disposables: (Disposable | Unsubscribe)[]): void;
  };
  readonly settings: ISettingsService;
  readonly workbench: IWorkbench;
}
