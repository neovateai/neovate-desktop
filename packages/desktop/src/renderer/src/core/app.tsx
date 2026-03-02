import { StrictMode, createContext, useContext } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { DisposableStore } from "./disposable";
import type { IRendererApp } from "./types";
import type { RendererPlugin, PluginContext } from "./plugin";
import { PluginManager } from "./plugin";
import filesPlugin from "../plugins/files";
import gitPlugin from "../plugins/git";
import { client } from "../orpc";

const RendererAppContext = createContext<RendererApp | null>(null);
const PluginContextReact = createContext<PluginContext | null>(null);

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

const BUILTIN_PLUGINS: RendererPlugin[] = [filesPlugin, gitPlugin];

export interface RendererAppOptions {
  plugins?: RendererPlugin[];
}

export class RendererApp implements IRendererApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();

  constructor(options: RendererAppOptions = {}) {
    this.pluginManager = new PluginManager([...BUILTIN_PLUGINS, ...(options.plugins ?? [])]);
  }

  async start(): Promise<void> {
    const ctx: PluginContext = { app: this, orpcClient: client };
    await this.pluginManager.configContributions();
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
              <App />
            </ThemeProvider>
          </PluginContextReact.Provider>
        </RendererAppContext.Provider>
      </StrictMode>,
    );
  }
}
