import { StrictMode, createContext, useContext } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { DisposableStore } from "./disposable";
import type { IRendererApp, RendererPlugin } from "./plugin";
import { PluginManager } from "./plugin";

const RendererAppContext = createContext<RendererApp | null>(null);

export function useRendererApp(): RendererApp {
  const app = useContext(RendererAppContext);
  if (!app) throw new Error("useRendererApp must be used within RendererApp");
  return app;
}

export interface RendererAppOptions {
  plugins?: RendererPlugin[];
}

export class RendererApp implements IRendererApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();

  constructor(options: RendererAppOptions = {}) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
  }

  async start(): Promise<void> {
    await this.pluginManager.configContributions();
    await this.pluginManager.activate({ app: this });
    await this.render();
  }

  private async render(): Promise<void> {
    const { default: App } = await import("../App");
    ReactDOM.createRoot(document.getElementById("root")!).render(
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
