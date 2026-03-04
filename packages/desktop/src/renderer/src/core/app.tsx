import { StrictMode, createContext, useContext, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { I18nManager } from "./i18n";
import { useConfigStore } from "../features/config/store";
import { useSettingsStore } from "../features/settings/store";
import { DisposableStore } from "./disposable";
import { ToastProvider } from "../components/ui/toast";
import type { IRendererApp, IWorkbench } from "./types";
import type { RendererPlugin, PluginContext } from "./plugin";
import { PluginManager } from "./plugin";
import { ContentPanel } from "../features/content-panel/content-panel";
import filesPlugin from "../plugins/files";
import gitPlugin from "../plugins/git";
import { client } from "../orpc";
import { SettingsService } from "../features/settings/service";
import type { SettingsSchema } from "../../../shared/features/settings/schema";

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

const BUILTIN_PLUGINS: RendererPlugin[] = [filesPlugin, gitPlugin];

export interface RendererAppOptions {
  plugins?: RendererPlugin[];
}

export class RendererApp implements IRendererApp {
  readonly pluginManager: PluginManager;
  readonly i18nManager: I18nManager;
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
    this.pluginManager = new PluginManager([...BUILTIN_PLUGINS, ...(options.plugins ?? [])]);
    this.i18nManager = new I18nManager();
  }

  initWorkbench(): void {
    const views = this.pluginManager.contributions.contentPanelViews;
    this.workbench = {
      contentPanel: new ContentPanel(views),
    };
  }

  async start(): Promise<void> {
    const ctx: PluginContext = { app: this, orpcClient: client };
    // Load persistent config (single source of truth)
    await useConfigStore.getState().load();
    // Initialize i18n with locale from config store
    await this.i18nManager.init({ store: useConfigStore as any });
    // TODO: hydrate blocks render — should run in background so UI renders immediately
    await this.hydrate();
    await this.pluginManager.configContributions();
    this.initWorkbench();

    const persistence = {
      load: (key: string) => client.state.load({ key }),
      save: (key: string, data: unknown) => client.state.save({ key, data }),
    };
    await this.workbench.contentPanel.hydrate(persistence);
    this.subscriptions.push(this.workbench.contentPanel.persist(persistence));

    await this.pluginManager.activate(ctx);
    await this.render(ctx);
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.settings.dispose();
    this.subscriptions.dispose();
  }

  /** Hydrate all stores from persistent storage */
  private async hydrate(): Promise<void> {
    await this.settings.hydrate();
  }

  private async render(ctx: PluginContext): Promise<void> {
    const root = document.getElementById("root");
    if (!root) throw new Error("Missing #root element");
    const { default: App } = await import("../App");
    ReactDOM.createRoot(root).render(
      <StrictMode>
        <RendererAppContext.Provider value={this}>
          <PluginContextReact.Provider value={ctx}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <ToastProvider>
                <ThemeSync />
                <MenuCommandHandler />
                <App />
              </ToastProvider>
            </ThemeProvider>
          </PluginContextReact.Provider>
        </RendererAppContext.Provider>
      </StrictMode>,
    );
  }
}
