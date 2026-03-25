import debug from "debug";
import i18n from "i18next";
import { ThemeProvider, useTheme } from "next-themes";
import { StrictMode, Suspense, createContext, useContext, useEffect, useRef, lazy } from "react";
import ReactDOM from "react-dom/client";

import type { ProjectTabState } from "../features/content-panel";
import type { RendererPlugin, PluginContext } from "./plugin";
import type { IRendererApp, IWorkbench } from "./types";

const deeplinkLog = debug("neovate:deeplink");

const startupLog = debug("neovate:startup");

import { setPanelWidth, shrinkPanelsToFit } from "../components/app-layout/layout-coordinator";
import { layoutStore } from "../components/app-layout/store";
import { ToastProvider, toastManager } from "../components/ui/toast";
import { claudeCodeChatManager } from "../features/agent/chat-manager";
import { registerSessionInStore } from "../features/agent/session-utils";
import { useAgentStore } from "../features/agent/store";
import { useConfigStore } from "../features/config/store";
import { ContentPanel } from "../features/content-panel";
import { useProjectStore } from "../features/project/store";
import { useSettingsStore } from "../features/settings/store";
import { client } from "../orpc";
import changesPlugin from "../plugins/changes";
import debugPlugin from "../plugins/debug";
// import contentPanelDemoPlugin from "../plugins/content-panel-demo";
// import demoWindowPlugin from "../plugins/demo-window";
import editorPlugin from "../plugins/editor";
import filesPlugin from "../plugins/files";
import gitPlugin from "../plugins/git";
import networkPlugin from "../plugins/network";
import { providersPlugin } from "../plugins/providers";
import searchPlugin from "../plugins/search";
import terminalPlugin from "../plugins/terminal";
import { DisposableStore } from "./disposable";
import { ExternalUriOpenerService } from "./external-uri-opener";
import { I18nManager } from "./i18n";
import { OpenerService } from "./opener";
import { PluginManager } from "./plugin";
import { WorkbenchLayoutService } from "./workbench/layout";

// Preserve context identity across HMR to prevent provider/consumer mismatch
const RendererAppContext: React.Context<RendererApp | null> =
  import.meta.hot?.data?.RendererAppContext ?? createContext<RendererApp | null>(null);
const PluginContextReact: React.Context<PluginContext | null> =
  import.meta.hot?.data?.PluginContextReact ?? createContext<PluginContext | null>(null);

if (import.meta.hot) {
  import.meta.hot.data.RendererAppContext = RendererAppContext;
  import.meta.hot.data.PluginContextReact = PluginContextReact;
}

export function useRendererApp(): RendererApp {
  const app = useContext(RendererAppContext);
  if (!app) throw new Error("useRendererApp must be used within RendererApp");
  return app;
}

export function usePluginContext(): PluginContext {
  const ctx = useContext(PluginContextReact);
  if (!ctx) throw new Error("usePluginContext must be used within RendererApp");
  return ctx;
}

/** Syncs persisted config theme → next-themes on initial load only */
function ThemeSync() {
  const configTheme = useConfigStore((s) => s.theme);
  const loaded = useConfigStore((s) => s.loaded);
  const { setTheme } = useTheme();
  const synced = useRef(false);

  useEffect(() => {
    if (loaded && !synced.current) {
      synced.current = true;
      setTheme(configTheme);
    }
  }, [configTheme, loaded, setTheme]);

  return null;
}

/** Syncs themeStyle to document.documentElement.dataset.style */
function StyleSync() {
  const themeStyle = useConfigStore((s) => s.themeStyle);
  const loaded = useConfigStore((s) => s.loaded);
  const initialized = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    const html = document.documentElement;

    const apply = () => {
      if (themeStyle === "default") {
        delete html.dataset.style;
      } else {
        html.dataset.style = themeStyle;
      }
    };

    // Skip transition on initial load
    if (!initialized.current) {
      initialized.current = true;
      apply();
      return;
    }

    // Smooth crossfade when user switches style
    if (document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }, [themeStyle, loaded]);

  return null;
}

/** Handle menu commands from main process (only for menu item clicks, not shortcuts) */
function MenuCommandHandler() {
  const showSettings = useSettingsStore((s) => s.showSettings);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);

  useEffect(() => {
    // Handle Settings menu item click from macOS app menu
    const handleOpenSettings = () => {
      setShowSettings(!showSettings);
    };

    const cleanupOpenSettings = window.api.onOpenSettings(handleOpenSettings);

    return () => {
      cleanupOpenSettings();
    };
  }, [showSettings, setShowSettings]);

  return null;
}

function resolveDeeplinkSession(sessionId: string, project: string) {
  const { sessions, agentSessions } = useAgentStore.getState();

  // Already in memory — just switch
  if (sessions.has(sessionId)) {
    deeplinkLog("session in memory, activating: %s", sessionId.slice(0, 8));
    useAgentStore.getState().setActiveSession(sessionId);
    return;
  }

  // Check if it exists in persisted sessions
  const info = agentSessions.find((s) => s.sessionId === sessionId);
  if (!info) {
    deeplinkLog("session not found: %s", sessionId.slice(0, 8));
    toastManager.add({
      type: "warning",
      title: i18n.t("deeplink.sessionNotFound"),
    });
    return;
  }

  // Load the persisted session
  deeplinkLog("loading persisted session: %s", sessionId.slice(0, 8));
  claudeCodeChatManager
    .loadSession(sessionId, info.cwd ?? project)
    .then(({ commands, models, currentModel, modelScope, providerId }) => {
      registerSessionInStore(
        sessionId,
        project,
        { commands, models, currentModel, modelScope, providerId },
        true,
      );
    })
    .catch(() => {
      toastManager.add({
        type: "warning",
        title: i18n.t("deeplink.sessionLoadFailed"),
      });
    });
}

/** Handle deeplinks from main process */
function DeeplinkHandler() {
  const sessionsLoaded = useAgentStore((s) => s.sessionsLoaded);
  const pendingDeeplink = useAgentStore((s) => s.pendingDeeplink);

  // Listen for incoming deeplinks
  useEffect(() => {
    const cleanup = window.api.onDeeplink(({ sessionId, project }) => {
      deeplinkLog("received deeplink: sessionId=%s project=%s", sessionId.slice(0, 8), project);
      const projectStore = useProjectStore.getState();

      // Validate project exists in project list
      const targetProject = projectStore.projects.find((p) => p.path === project);
      if (!targetProject || targetProject.pathMissing) {
        deeplinkLog("project not found: %s", project);
        toastManager.add({
          type: "warning",
          title: i18n.t("deeplink.projectNotFound"),
        });
        return;
      }

      // Check if we need to switch projects
      if (projectStore.activeProject?.path !== project) {
        deeplinkLog("switching project: %s", project);
        useAgentStore.getState().setPendingDeeplink({ sessionId, project });
        projectStore.switchToProjectByPath(project);
        return;
      }

      // Same project — resolve directly
      resolveDeeplinkSession(sessionId, project);
    });
    return cleanup;
  }, []);

  // Resolve pending deeplink after sessions load from project switch
  useEffect(() => {
    if (pendingDeeplink && sessionsLoaded) {
      deeplinkLog("resolving pending deeplink: %s", pendingDeeplink.sessionId.slice(0, 8));
      resolveDeeplinkSession(pendingDeeplink.sessionId, pendingDeeplink.project);
      useAgentStore.getState().setPendingDeeplink(null);
    }
  }, [sessionsLoaded, pendingDeeplink]);

  return null;
}

const BUILTIN_PLUGINS: RendererPlugin[] = [
  filesPlugin,
  gitPlugin,
  terminalPlugin,
  searchPlugin,
  editorPlugin,
  changesPlugin,
  networkPlugin,
  debugPlugin,
  providersPlugin,
  // TODO: Remove in the future
  // contentPanelDemoPlugin
  // demoWindowPlugin,
];

export interface RendererAppOptions {
  plugins?: RendererPlugin[];
}

export class RendererApp implements IRendererApp {
  readonly pluginManager: PluginManager;
  readonly i18nManager: I18nManager;
  readonly opener = new OpenerService();
  readonly #windowType: string;
  // @ts-expect-error reserved for future use
  readonly #windowId: string;
  readonly subscriptions = new DisposableStore();
  readonly project = {
    getActiveProject: () => {
      const activeProject = useProjectStore.getState().activeProject;
      if (!activeProject) return activeProject;
      const { id, name, path } = activeProject;
      return { id, name, path };
    },
    subscribe: (
      listener: (project: ReturnType<typeof useProjectStore.getState>["activeProject"]) => void,
    ) =>
      useProjectStore.subscribe((state, prevState) => {
        if (state.activeProject === prevState.activeProject) return;
        listener(state.activeProject);
      }),
    refresh: async () => {
      const prevActive = useProjectStore.getState().activeProject;
      const [projects, activeProject] = await Promise.all([
        client.project.list(),
        client.project.getActive(),
      ]);
      const state = useProjectStore.getState();
      state.setProjects(projects);
      state.setActiveProject(activeProject);

      // Notify user when their active project was cleared due to a missing path
      if (prevActive && !activeProject && projects.length > 0) {
        toastManager.add({
          type: "warning",
          title: i18n.t("project.unavailable", { name: prevActive.name }),
          description: i18n.t("project.directoryNotFound", { path: prevActive.path }),
          timeout: 8000,
        });
      }

      return activeProject;
    },
  };
  workbench!: IWorkbench;

  constructor(options: RendererAppOptions = {}) {
    const { windowType, windowId } = this.#resolveWindowParams();
    this.#windowType = windowType;
    this.#windowId = windowId;
    this.pluginManager = new PluginManager([...BUILTIN_PLUGINS, ...(options.plugins ?? [])]);
    this.i18nManager = new I18nManager();
  }

  /** Read window params from URL and stamp them onto <html> */
  #resolveWindowParams(): { windowType: string; windowId: string } {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const windowType = params.get("windowType") ?? "main";
    const windowId = params.get("windowId") ?? "main";
    if (typeof document !== "undefined") {
      const html = document.documentElement;
      html.dataset.windowType = windowType;
      html.dataset.windowId = windowId;
    }
    return { windowType, windowId };
  }

  initWorkbench(): void {
    const views = this.pluginManager.contributions.contentPanelViews;
    // TODO: Move app-layout UI to consume app.workbench.layout directly, then
    // transfer store ownership from components/app-layout/store into
    // WorkbenchLayoutService.
    const layout = new WorkbenchLayoutService({
      isExpanded: (part) => !layoutStore.getState().panels[part].collapsed,
      togglePart: (part) => layoutStore.getState().togglePanel(part),
      maximizeContentPanel: () => {
        const { panels } = layoutStore.getState();
        if (panels.contentPanel.collapsed) return;

        // TODO: This produces a feasible fitted layout, but not the true maximize width.
        // Replace it with target-aware maximize math before plugin consumers depend on it.
        const proposed = setPanelWidth(panels, "contentPanel", window.innerWidth);
        const resolved = shrinkPanelsToFit(proposed, window.innerWidth);

        layoutStore.setState({ panels: resolved });
      },
    });
    // Wire plugin-contributed openers into the opener system
    const externalUriOpenerService = new ExternalUriOpenerService(this.opener);
    for (const { id, opener: uriOpener, metadata } of this.pluginManager.contributions
      .externalUriOpeners) {
      this.subscriptions.push(
        externalUriOpenerService.registerExternalUriOpener(id, uriOpener, metadata),
      );
    }

    this.workbench = {
      layout,
      contentPanel: new ContentPanel({
        views,
        layout,
        load: async () => {
          const data = await client.storage.get({ namespace: "contentPanel", key: "projects" });
          return (data as Record<string, ProjectTabState>) ?? {};
        },
        save: (data) =>
          client.storage.set({ namespace: "contentPanel", key: "projects", value: data }),
      }),
    };
  }

  async start(): Promise<void> {
    const t0 = performance.now();
    const el = () => `${Math.round(performance.now() - t0)}ms`;
    const ctx: PluginContext = { app: this, orpcClient: client };

    // Infrastructure — all windows
    await useConfigStore.getState().load();
    startupLog("renderer config loaded %s", el());
    await this.i18nManager.init({ store: useConfigStore as any });
    const i18nConfigs = await this.pluginManager.configI18n();
    this.i18nManager.setupLazyNamespaces(i18nConfigs);
    startupLog("renderer i18n done %s", el());
    await this.project.refresh();
    startupLog("renderer project.refresh done %s", el());

    // Collect window contributions — all windows (needed for lookup)
    await this.pluginManager.configWindowContributions();
    startupLog("renderer windowContributions done %s", el());

    if (this.#windowType === "main") {
      // Main window — full plugin UI
      await this.pluginManager.configContributions(ctx);
      startupLog("renderer pluginContributions done %s", el());
      this.initWorkbench();
      await this.workbench.contentPanel.hydrate();
      startupLog("renderer contentPanel hydrated %s", el());
    }

    await this.pluginManager.activate(ctx);
    startupLog("renderer plugins activated %s", el());
    this.render(ctx);
    startupLog("renderer React.render called %s", el());
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    if (this.#windowType === "main") {
      this.workbench.contentPanel.dispose();
    }
    this.subscriptions.dispose();
  }

  private render(ctx: PluginContext): void {
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("Missing #root element");

    const reactDomRoot = ReactDOM.createRoot(rootElement);

    if (this.#windowType === "main") {
      const AppComponent = lazy(() => import("../App"));
      return reactDomRoot.render(
        <StrictMode>
          <RendererAppContext.Provider value={this}>
            <PluginContextReact.Provider value={ctx}>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <ToastProvider>
                  <ThemeSync />
                  <StyleSync />
                  <MenuCommandHandler />
                  <DeeplinkHandler />
                  <Suspense
                    fallback={
                      <div className="flex h-screen items-center justify-center">
                        <div className="animate-spin size-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
                      </div>
                    }
                  >
                    <AppComponent />
                  </Suspense>
                </ToastProvider>
              </ThemeProvider>
            </PluginContextReact.Provider>
          </RendererAppContext.Provider>
        </StrictMode>,
      );
    }
    const windowDef = this.pluginManager.windowContributions.find(
      (w) => w.windowType === this.#windowType,
    );
    if (!windowDef) return reactDomRoot.render(<div>Unknown window type: {this.#windowType}</div>);
    const WindowComponent = lazy(windowDef.component);

    reactDomRoot.render(
      <StrictMode>
        <RendererAppContext.Provider value={this}>
          <PluginContextReact.Provider value={ctx}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <ToastProvider>
                <Suspense
                  fallback={
                    <div className="flex h-screen items-center justify-center">
                      <div className="animate-spin size-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
                    </div>
                  }
                >
                  <WindowComponent />
                </Suspense>
              </ToastProvider>
            </ThemeProvider>
          </PluginContextReact.Provider>
        </RendererAppContext.Provider>
      </StrictMode>,
    );
  }
}
