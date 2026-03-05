import type { StoreApi } from "zustand/vanilla";
import type { ContentPanelView } from "../../core/plugin/contributions";
import type { Tab, ContentPanelStoreState, ProjectTabState } from "./types";
import { createContentPanelStore } from "./store";

export interface ContentPanelOptions {
  views: ContentPanelView[];
  load: () => Promise<Record<string, ProjectTabState>>;
  save: (data: Record<string, ProjectTabState>) => Promise<void> | void;
}

const DEBOUNCE_MS = 100;

export class ContentPanel {
  private views: ContentPanelView[];
  private projectPath: string = "";
  private options: ContentPanelOptions;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly store: StoreApi<ContentPanelStoreState>;

  constructor(options: ContentPanelOptions) {
    this.options = options;
    this.views = options.views;
    this.store = createContentPanelStore();
  }

  async hydrate(): Promise<void> {
    const data = await this.options.load();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      this.store.setState({ projects: data });
    }
    this.observe();
  }

  /** Returns the set of registered view types. */
  get registeredViewTypes(): Set<string> {
    return new Set(this.views.map((v) => v.viewType));
  }

  private observe(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.subscribe(() => {
      this.dirty = true;
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
    });
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.dirty) {
      this.dirty = false;
      const { projects } = this.store.getState();
      Promise.resolve(this.options.save(projects)).catch(console.error);
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.unsubscribe?.();
  }

  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  openView(viewType: string, options?: { name?: string; activate?: boolean }): string {
    const view = this.views.find((v) => v.viewType === viewType);
    if (!view) throw new Error(`Unknown view: ${viewType}`);

    const store = this.store.getState();
    const activate = options?.activate !== false;

    // Singleton (default true): activate existing if present (per-project)
    if (view.singleton !== false) {
      const existing = store.findTabByViewType(this.projectPath, viewType);
      if (existing) {
        if (activate) this.activateView(existing.id);
        return existing.id;
      }
    }

    const tab: Tab = {
      id: crypto.randomUUID(),
      viewType,
      name: options?.name ?? view.name,
      state: {},
    };

    store.addTab(this.projectPath, tab, activate);
    return tab.id;
  }

  closeView(viewId: string): void {
    this.store.getState().removeTab(this.projectPath, viewId);
  }

  activateView(viewId: string): void {
    this.store.getState().setActiveTab(this.projectPath, viewId);
  }

  updateView(viewId: string, patch: { name?: string }): void {
    this.store.getState().updateTab(this.projectPath, viewId, patch);
  }

  getViewState(viewId: string): Record<string, unknown> {
    return this.store.getState().getTab(this.projectPath, viewId)?.state ?? {};
  }

  updateViewState(viewId: string, patch: Record<string, unknown>): void {
    this.store.getState().updateTabState(this.projectPath, viewId, patch);
  }
}
