import { os } from "@orpc/server";
import { PluginManager } from "./core/plugin/plugin-manager";
import { DisposableStore } from "./core/disposable";
import type { IBrowserWindowManager, IMainApp } from "./core/types";
import type { MainPlugin } from "./core/plugin/types";

export interface MainAppOptions {
  plugins?: MainPlugin[];
  windowManager: IBrowserWindowManager;
}

export class MainApp implements IMainApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  readonly windowManager: IBrowserWindowManager;

  constructor(options: MainAppOptions) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
    this.windowManager = options.windowManager;
  }

  async start(): Promise<void> {
    const ctx = { app: this, orpcServer: os };
    await this.pluginManager.configContributions(ctx);
    await this.pluginManager.activate(ctx);
    this.windowManager.createMainWindow();
  }

  async stop(): Promise<void> {
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
  }
}
