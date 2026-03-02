import { StrictMode, createContext, useContext } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { DisposableStore } from "./disposable";
import type { IRendererApp } from "./types";
import type { RendererPlugin } from "./plugin";
import { PluginManager } from "./plugin";
import filesPlugin from "../plugins/files";
import gitPlugin from "../plugins/git";

const RendererAppContext = createContext<RendererApp | null>(null);

export function useRendererApp(): RendererApp {
  const app = useContext(RendererAppContext);
  if (!app) throw new Error("useRendererApp must be used within RendererApp");
  return app;
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
    await this.pluginManager.configContributions();
    await this.pluginManager.activate({ app: this });
    await this.render();
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.subscriptions.dispose();
  }

  private async render(): Promise<void> {
    const root = document.getElementById("root");
    if (!root) throw new Error("Missing #root element");
    const { default: App } = await import("../App");
    ReactDOM.createRoot(root).render(
      <StrictMode>
        <RendererAppContext.Provider value={this}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <App />
          </ThemeProvider>
        </RendererAppContext.Provider>
      </StrictMode>,
    );
  }
}
