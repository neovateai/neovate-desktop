import { StrictMode, createContext, useContext, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { useConfigStore } from "../features/config/store";
import { DisposableStore } from "./disposable";
import type { IRendererApp, IWorkbench } from "./types";
import type { RendererPlugin, PluginContext } from "./plugin";
import { PluginManager } from "./plugin";
import { ContentPanel } from "../features/content-panel/content-panel";
import filesPlugin from "../plugins/files";
import gitPlugin from "../plugins/git";
import { client } from "../orpc";

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

const BUILTIN_PLUGINS: RendererPlugin[] = [filesPlugin, gitPlugin];

export interface RendererAppOptions {
  plugins?: RendererPlugin[];
}

export class RendererApp implements IRendererApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  workbench!: IWorkbench;

  constructor(options: RendererAppOptions = {}) {
    this.pluginManager = new PluginManager([...BUILTIN_PLUGINS, ...(options.plugins ?? [])]);
  }

  initWorkbench(): void {
    const views = this.pluginManager.contributions.contentPanelViews;
    this.workbench = {
      contentPanel: new ContentPanel(views),
    };
  }

  async start(): Promise<void> {
    const ctx: PluginContext = { app: this, orpcClient: client };
    await useConfigStore.getState().load();
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
    this.subscriptions.dispose();
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
              <ThemeSync />
              <App />
            </ThemeProvider>
          </PluginContextReact.Provider>
        </RendererAppContext.Provider>
      </StrictMode>,
    );
  }
}
