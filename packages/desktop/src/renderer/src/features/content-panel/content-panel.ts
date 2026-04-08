import type { StoreApi } from "zustand/vanilla";

import debug from "debug";

import type { ContentPanelView } from "../../core/plugin/contributions";
import type { ReadonlyStoreApi } from "../../core/types";
import type { IWorkbenchLayoutService } from "../../core/workbench/layout";
import type { Tab, ContentPanelStoreState, ProjectTabState } from "./types";

import { COLLAPSIBLE_WORKBENCH_PART } from "../../core/workbench/layout";
import { createContentPanelStore } from "./store";

const log = debug("neovate:content-panel");

export interface ContentPanelOptions {
  views: ContentPanelView[];
  load: () => Promise<Record<string, ProjectTabState>>;
  save: (data: Record<string, ProjectTabState>) => Promise<void> | void;
  layout: IWorkbenchLayoutService;
}

const DEBOUNCE_MS = 100;

export class ContentPanel {
  private views: ContentPanelView[];
  private projectPath: string = "";
  private options: ContentPanelOptions;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly #store: StoreApi<ContentPanelStoreState>;
  // TODO: Store state still includes actions (addTab, removeTab, etc.) accessible via getState().
  // Adopt Zustand's "no store actions" pattern to make the store pure data:
  // move store-level actions into private ContentPanel methods that call #store.setState().
  // See: https://zustand.docs.pmnd.rs/learn/guides/practice-with-no-store-actions
  readonly store: ReadonlyStoreApi<ContentPanelStoreState>;

  constructor(options: ContentPanelOptions) {
    this.options = options;
    this.views = options.views;
    this.#store = createContentPanelStore();
    this.store = this.#store;
  }

  async hydrate(): Promise<void> {
    log("hydrating");
    const data = await this.options.load();
    this.observe();
    if (data && typeof data === "object" && !Array.isArray(data) && Object.keys(data).length > 0) {
      const filtered = this.filterPersistable(data);
      log("hydrated", { projectCount: Object.keys(filtered).length });
      this.#store.setState({ projects: filtered });
    }
  }

  /** Returns the set of registered view types. */
  get registeredViewTypes(): Set<string> {
    return new Set(this.views.map((v) => v.viewType));
  }

  private observe(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.#store.subscribe(() => {
      this.dirty = true;
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
    });
  }

  /** Strip non-persistable tabs. Pure — does not mutate input. */
  private filterPersistable(
    projects: Record<string, ProjectTabState>,
  ): Record<string, ProjectTabState> {
    const nonPersist = new Set(
      this.views.filter((v) => v.persist === false).map((v) => v.viewType),
    );
    if (nonPersist.size === 0) return projects;

    const result: Record<string, ProjectTabState> = {};
    for (const [path, project] of Object.entries(projects)) {
      const tabs = project.tabs.filter((t) => !nonPersist.has(t.viewType));
      const lost = project.activeTabId != null && !tabs.some((t) => t.id === project.activeTabId);
      const activeTabId = lost ? (tabs[0]?.id ?? null) : project.activeTabId;
      result[path] = { tabs, activeTabId };
    }
    return result;
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.dirty) {
      this.dirty = false;
      log("flushing state to storage");
      const { projects } = this.#store.getState();
      Promise.resolve(this.options.save(this.filterPersistable(projects))).catch(console.error);
    }
  }

  dispose(): void {
    log("disposing");
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.unsubscribe?.();
  }

  setProjectPath(path: string): void {
    log("set project path", { path });
    this.projectPath = path;
  }

  openView(
    viewType: string,
    options?: { activate?: boolean; state?: Record<string, unknown> },
  ): string {
    log("open view", { viewType, options });
    const view = this.views.find((v) => v.viewType === viewType);
    if (!view) throw new Error(`Unknown view: ${viewType}`);

    void this.options.layout.expandPart(COLLAPSIBLE_WORKBENCH_PART.contentPanel);

    const store = this.#store.getState();
    const activate = options?.activate !== false;

    // Singleton (default true): activate existing if present (per-project)
    if (view.singleton !== false) {
      const existing = store.findTabByViewType(this.projectPath, viewType);
      if (existing) {
        log("singleton view already open, activating", { viewType, tabId: existing.id });
        if (activate) this.activateView(existing.id);
        return existing.id;
      }
    }

    const tab: Tab = {
      id: crypto.randomUUID(),
      viewType,
      state: options?.state ?? {},
    };

    log("opening new tab", { tabId: tab.id, viewType, activate });
    store.addTab(this.projectPath, tab, activate);
    return tab.id;
  }

  toggleView(viewType: string): void {
    const view = this.views.find((v) => v.viewType === viewType);
    if (!view) return;

    const store = this.#store.getState();
    const existing = store.findTabByViewType(this.projectPath, viewType);

    if (!existing) {
      this.openView(viewType);
      return;
    }

    const project = store.getProjectState(this.projectPath);
    const isActive = project.activeTabId === existing.id;

    if (isActive) {
      void this.options.layout.togglePart(COLLAPSIBLE_WORKBENCH_PART.contentPanel);
    } else {
      this.activateView(existing.id);
      void this.options.layout.expandPart(COLLAPSIBLE_WORKBENCH_PART.contentPanel);
    }
  }

  closeView(viewId: string): void {
    log("close view", { viewId });
    this.#store.getState().removeTab(this.projectPath, viewId);
  }

  activateView(viewId: string): void {
    log("activate view", { viewId });
    this.#store.getState().setActiveTab(this.projectPath, viewId);
  }

  getViewState(viewId: string): Record<string, unknown> {
    return this.#store.getState().getTab(this.projectPath, viewId)?.state ?? {};
  }

  updateViewState(viewId: string, patch: Record<string, unknown>): void {
    log("update view state", { viewId });
    this.#store.getState().updateTabState(this.projectPath, viewId, patch);
  }
}
