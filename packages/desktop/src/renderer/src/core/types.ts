import type { AnalyticsInstance } from "analytics";
import type { StoreApi } from "zustand/vanilla";

import type { Project } from "../../../shared/features/project/types";
import type { ContentPanel } from "../features/content-panel/content-panel";
import type { RendererAppOptions } from "./app";
import type { Disposable, Unsubscribe } from "./disposable";
import type { I18nManager } from "./i18n";
import type { IWorkbenchLayoutService } from "./workbench/layout";

/**
 * Read-only subset of Zustand's StoreApi — exposes only getState, getInitialState,
 * and subscribe. Matches the internal ReadonlyStoreApi that Zustand's useStore accepts
 * (since v4.5.3 / PR #2586), but is not exported by Zustand itself.
 */
export type ReadonlyStoreApi<T> = Pick<StoreApi<T>, "getState" | "getInitialState" | "subscribe">;

export interface IProjectService {
  getActiveProject(): Pick<Project, "id" | "name" | "path"> | null;
  subscribe(listener: (project: Project | null) => void): Unsubscribe;
  refresh(): Promise<Project | null>;
}

export interface IWorkbench {
  readonly layout: IWorkbenchLayoutService;
  readonly contentPanel: ContentPanel;
}

/** Abstract app interface — plugins depend on this, RendererApp implements it */
export interface IRendererApp {
  readonly analytics: AnalyticsInstance;
  readonly i18nManager: I18nManager;
  readonly subscriptions: {
    push(...disposables: (Disposable | Unsubscribe)[]): void;
  };
  readonly project: IProjectService;
  readonly workbench: IWorkbench;
  readonly options: RendererAppOptions;
}
