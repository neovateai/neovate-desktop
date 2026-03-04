import type { StoreApi } from "zustand/vanilla";
import { Hookable } from "hookable";
import type { ContentPanelView } from "../../core/plugin/contributions";
import type { Tab, ContentPanelStoreState, ProjectTabState } from "./types";
import { createContentPanelStore } from "./store";

interface ViewContext {
  viewId: string;
  instanceId: string;
}

export interface ContentPanelHooks {
  opened: (
    context: ViewContext & { props: Record<string, unknown> },
  ) => void | Promise<void>;
  closed: (context: ViewContext) => void | Promise<void>;
  activated: (context: ViewContext) => void;
  deactivated: (context: ViewContext) => void;
}

// beforeClose is handled separately via callHookWith + bailCaller
// because hookable's HookCallback type only allows void returns.
// We store beforeClose handlers in the same hook registry but bypass
// the type system at the boundary.
type BeforeCloseHandler = (
  context: ViewContext,
) => boolean | Promise<boolean>;

async function bailCaller(
  hooks: ((...args: any[]) => any)[],
  args: unknown[],
): Promise<boolean> {
  for (const hook of hooks) {
    if ((await hook(...args)) === false) return false;
  }
  return true;
}

export interface ContentPanelOptions {
  views: ContentPanelView[];
  load: () => Promise<Record<string, ProjectTabState>>;
  save: (data: Record<string, ProjectTabState>) => Promise<void> | void;
}

const DEBOUNCE_MS = 100;

export class ContentPanel extends Hookable<ContentPanelHooks> {
  private views: ContentPanelView[];
  private projectPath: string = "";
  private options: ContentPanelOptions;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly store: StoreApi<ContentPanelStoreState>;

  constructor(options: ContentPanelOptions) {
    super();
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

  /** Returns the set of registered view IDs. */
  get registeredViewIds(): Set<string> {
    return new Set(this.views.map((v) => v.id));
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

  /** Register a beforeClose guard. Returns unsubscribe function. */
  onBeforeClose(handler: BeforeCloseHandler): () => void {
    return (this as any).hook("beforeClose", handler);
  }

  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  async openView(
    viewId: string,
    options?: { name?: string; props?: Record<string, unknown>; activate?: boolean },
  ): Promise<string> {
    const view = this.views.find((v) => v.id === viewId);
    if (!view) throw new Error(`Unknown view: ${viewId}`);

    const store = this.store.getState();
    const props = options?.props ?? {};
    const activate = options?.activate !== false;

    // Singleton (default true): activate existing if present (per-project)
    if (view.singleton !== false) {
      const existing = store.findTabByViewId(this.projectPath, viewId);
      if (existing) {
        if (activate) this.activateView(existing.id);
        return existing.id;
      }
    }

    const tab: Tab = {
      id: crypto.randomUUID(),
      viewId,
      name: options?.name ?? view.name,
      state: {},
    };

    store.addTab(this.projectPath, tab, activate);
    await this.callHook("opened", { viewId, instanceId: tab.id, props });
    return tab.id;
  }

  async closeView(instanceId: string): Promise<void> {
    const store = this.store.getState();
    const tab = store.getTab(this.projectPath, instanceId);
    if (!tab) return;

    const context = { viewId: tab.viewId, instanceId };
    const allowed = await (this as any).callHookWith(bailCaller, "beforeClose", [
      context,
    ]);
    if (allowed === false) return;

    store.removeTab(this.projectPath, instanceId);
    await this.callHook("closed", context);
  }

  activateView(instanceId: string): void {
    const store = this.store.getState();
    const projectState = store.getProjectState(this.projectPath);
    const prevId = projectState.activeTabId;
    const prevTab = prevId
      ? store.getTab(this.projectPath, prevId)
      : undefined;
    const nextTab = store.getTab(this.projectPath, instanceId);

    if (prevTab && prevTab.id !== instanceId) {
      this.callHook("deactivated", {
        viewId: prevTab.viewId,
        instanceId: prevTab.id,
      });
    }

    store.setActiveTab(this.projectPath, instanceId);

    if (nextTab) {
      this.callHook("activated", { viewId: nextTab.viewId, instanceId });
    }
  }

  updateView(instanceId: string, patch: { name?: string }): void {
    this.store.getState().updateTab(this.projectPath, instanceId, patch);
  }

  getViewState(instanceId: string): Record<string, unknown> {
    return (
      this.store.getState().getTab(this.projectPath, instanceId)?.state ?? {}
    );
  }

  updateViewState(
    instanceId: string,
    patch: Record<string, unknown>,
  ): void {
    this.store
      .getState()
      .updateTabState(this.projectPath, instanceId, patch);
  }
}
