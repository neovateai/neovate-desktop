import { createStore, type StoreApi } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { Hookable, type HookCallback } from "hookable";
import type { ContentPanelView } from "../../core/plugin/contributions";
import type { Tab, ProjectTabState, ContentPanelStoreState } from "./types";

const EMPTY_PROJECT: ProjectTabState = { tabs: [], activeTabId: null };

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
  beforeClose: (context: ViewContext) => boolean | Promise<boolean>;
}

async function bailCaller(
  hooks: HookCallback[],
  args: any[],
): Promise<boolean> {
  for (const hook of hooks) {
    if ((await hook(...args)) === false) return false;
  }
  return true;
}

export class ContentPanel extends Hookable<ContentPanelHooks> {
  private views: ContentPanelView[];
  private projectPath: string = "";
  readonly store: StoreApi<ContentPanelStoreState>;

  constructor(views: ContentPanelView[]) {
    super();
    this.views = views;
    this.store = createStore<ContentPanelStoreState>()(
      immer((set, get) => ({
        projects: {},

        addTab(projectPath, tab) {
          set((s) => {
            if (!s.projects[projectPath])
              s.projects[projectPath] = { tabs: [], activeTabId: null };
            s.projects[projectPath].tabs.push(tab);
            s.projects[projectPath].activeTabId = tab.id;
          });
        },

        removeTab(projectPath, tabId) {
          set((s) => {
            const project = s.projects[projectPath];
            if (!project) return;
            const idx = project.tabs.findIndex((t) => t.id === tabId);
            if (idx === -1) return;
            project.tabs.splice(idx, 1);
            if (project.activeTabId === tabId) {
              const prev = project.tabs[Math.max(0, idx - 1)];
              project.activeTabId = prev?.id ?? null;
            }
          });
        },

        setActiveTab(projectPath, tabId) {
          set((s) => {
            const project = s.projects[projectPath];
            if (project) project.activeTabId = tabId;
          });
        },

        updateTab(projectPath, tabId, patch) {
          set((s) => {
            const tab = s.projects[projectPath]?.tabs.find(
              (t) => t.id === tabId,
            );
            if (!tab) return;
            if (patch.name !== undefined) tab.name = patch.name;
          });
        },

        updateTabState(projectPath, tabId, patch) {
          set((s) => {
            const tab = s.projects[projectPath]?.tabs.find(
              (t) => t.id === tabId,
            );
            if (!tab) return;
            Object.assign(tab.state, patch);
          });
        },

        getTab(projectPath, tabId) {
          return get().projects[projectPath]?.tabs.find(
            (t) => t.id === tabId,
          );
        },

        getProjectState(projectPath) {
          return get().projects[projectPath] ?? EMPTY_PROJECT;
        },

        findTabByViewId(projectPath, viewId) {
          return get().projects[projectPath]?.tabs.find(
            (t) => t.viewId === viewId,
          );
        },

        removeProject(projectPath) {
          set((s) => {
            delete s.projects[projectPath];
          });
        },
      })),
    );
  }

  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  async openView(
    viewId: string,
    options?: { name?: string; props?: Record<string, unknown> },
  ): Promise<string> {
    const view = this.views.find((v) => v.id === viewId);
    if (!view) throw new Error(`Unknown view: ${viewId}`);

    const store = this.store.getState();
    const props = options?.props ?? {};

    // Singleton (default true): activate existing if present (per-project)
    if (view.singleton !== false) {
      const existing = store.findTabByViewId(this.projectPath, viewId);
      if (existing) {
        this.activateView(existing.id);
        return existing.id;
      }
    }

    const tab: Tab = {
      id: crypto.randomUUID(),
      viewId,
      name: options?.name ?? view.name,
      state: {},
    };

    store.addTab(this.projectPath, tab);
    await this.callHook("opened", { viewId, instanceId: tab.id, props });
    return tab.id;
  }

  async closeView(instanceId: string): Promise<void> {
    const store = this.store.getState();
    const tab = store.getTab(this.projectPath, instanceId);
    if (!tab) return;

    const context = { viewId: tab.viewId, instanceId };
    const allowed = await this.callHookWith(bailCaller, "beforeClose", [
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
