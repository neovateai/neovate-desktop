import { os } from "@orpc/server";
import type { AnyRouter } from "@orpc/server";
import { PluginManager } from "./core/plugin/plugin-manager";
import { DisposableStore } from "./core/disposable";
import type { IBrowserWindowManager, IMainApp } from "./core/types";
import type { MainPlugin } from "./core/plugin/types";
import { buildRouter } from "./router";
import { BrowserWindowManager } from "./core";

export interface MainAppOptions {
  plugins?: MainPlugin[];
}

export class MainApp implements IMainApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  readonly windowManager: IBrowserWindowManager;
  #router: AnyRouter | null = null;

  get router(): AnyRouter {
    if (!this.#router) throw new Error("MainApp.start() must be called first");
    return this.#router;
  }

  constructor(options: MainAppOptions) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
    this.windowManager = new BrowserWindowManager();
  }

  async start(): Promise<void> {
    const ctx = { app: this, orpcServer: os };
    await this.pluginManager.configContributions(ctx);
    await this.pluginManager.activate(ctx);
    this.#router = buildRouter(this.pluginManager.contributions.routers);
    this.windowManager.createMainWindow();
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
  }
}
