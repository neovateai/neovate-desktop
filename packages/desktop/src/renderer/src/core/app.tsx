import { ThemeProvider, useTheme } from "next-themes";
import { StrictMode, Suspense, createContext, useContext, useEffect, lazy } from "react";
import ReactDOM from "react-dom/client";

import type { SettingsSchema } from "../../../shared/features/settings/schema";
import type { ProjectTabState } from "../features/content-panel";
import type { RendererPlugin, PluginContext } from "./plugin";
import type { IRendererApp, IWorkbench } from "./types";

import { ToastProvider } from "../components/ui/toast";
import { useConfigStore } from "../features/config/store";
import { ContentPanel } from "../features/content-panel";
import { SettingsService } from "../features/settings/service";
import { useSettingsStore } from "../features/settings/store";
import { client } from "../orpc";
import editorPlugin from "../plugins/editor";
import filesPlugin from "../plugins/files";
import gitPlugin from "../plugins/git";
import searchPlugin from "../plugins/search";
import terminalPlugin from "../plugins/terminal";
// import contentPanelDemoPlugin from "../plugins/content-panel-demo";
// import demoWindowPlugin from "../plugins/demo-window";
import { DisposableStore } from "./disposable";
import { I18nManager } from "./i18n";
import { PluginManager } from "./plugin";

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

/** Syncs persisted config theme → next-themes on load */
function ThemeSync() {
  const configTheme = useConfigStore((s) => s.theme);
  const loaded = useConfigStore((s) => s.loaded);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (loaded) {
      setTheme(configTheme);
    }
  }, [configTheme, loaded, setTheme]);

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

const BUILTIN_PLUGINS: RendererPlugin[] = [
  filesPlugin,
  gitPlugin,
  terminalPlugin,
  searchPlugin,
  editorPlugin,
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
  readonly #windowType: string;
  // @ts-expect-error reserved for future use
  readonly #windowId: string;
  readonly subscriptions = new DisposableStore();
  readonly settings = new SettingsService({
    load: async () => {
      const all = await client.storage.getAll({ namespace: "config" });
      return ((all as Record<string, unknown>).settings as Partial<SettingsSchema>) ?? {};
    },
    save: (data) => {
      return client.storage.set({ namespace: "config", key: "settings", value: data });
    },
  });
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
    this.workbench = {
      contentPanel: new ContentPanel({
        views,
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
    const ctx: PluginContext = { app: this, orpcClient: client };

    // Infrastructure — all windows
    await useConfigStore.getState().load();
    await this.i18nManager.init({ store: useConfigStore as any });
    const i18nConfigs = await this.pluginManager.configI18n();
    this.i18nManager.setupLazyNamespaces(i18nConfigs);
    await this.hydrate();

    // Collect window contributions — all windows (needed for lookup)
    await this.pluginManager.configWindowContributions();

    if (this.#windowType === "main") {
      // Main window — full plugin UI
      await this.pluginManager.configContributions();
      this.initWorkbench();
      await this.workbench.contentPanel.hydrate();
    }

    await this.pluginManager.activate(ctx);
    this.render(ctx);
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    if (this.#windowType === "main") {
      this.workbench.contentPanel.dispose();
    }
    this.settings.dispose();
    this.subscriptions.dispose();
  }

  /** Hydrate all stores from persistent storage */
  private async hydrate(): Promise<void> {
    await this.settings.hydrate();
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
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <ToastProvider>
                  <ThemeSync />
                  <MenuCommandHandler />
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
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <ToastProvider>
                <ThemeSync />
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
