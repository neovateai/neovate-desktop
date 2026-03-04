import type { Disposable } from "./disposable";
import type { I18nManager } from "./i18n";
import type { IRendererSettingsService } from "./storage/settings-service";

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly i18nManager: I18nManager;
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly settings: IRendererSettingsService;
}
