import type { Disposable } from "./disposable";
import type { I18nManager } from "./i18n";

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly i18nManager: I18nManager;
  readonly subscriptions: { push(...disposables: Disposable[]): void };
}
