import type { Disposable } from "./disposable";

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
}
