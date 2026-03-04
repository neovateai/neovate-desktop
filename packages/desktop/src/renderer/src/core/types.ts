import type { Disposable, Unsubscribe } from "./disposable";
import type { ContentPanel } from "../features/content-panel/content-panel";

export interface IWorkbench {
  readonly contentPanel: ContentPanel;
}

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly subscriptions: {
    push(...disposables: (Disposable | Unsubscribe)[]): void;
  };
  readonly workbench: IWorkbench;
}
