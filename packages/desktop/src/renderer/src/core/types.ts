import type { Project } from "../../../shared/features/project/types";
import type { ContentPanel } from "../features/content-panel/content-panel";
import type { Disposable, Unsubscribe } from "./disposable";
import type { I18nManager } from "./i18n";
import type { IWorkbenchLayoutService } from "./workbench/layout";

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
  readonly i18nManager: I18nManager;
  readonly subscriptions: {
    push(...disposables: (Disposable | Unsubscribe)[]): void;
  };
  readonly project: IProjectService;
  readonly workbench: IWorkbench;
}
