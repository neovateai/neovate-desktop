import type { AnyRouter } from "@orpc/server";

import { os } from "@orpc/server";

import type { MainPlugin } from "./core/plugin/types";
import type { IBrowserWindowManager, IMainApp } from "./core/types";

import { BrowserWindowManager } from "./core";
import { DisposableStore } from "./core/disposable";
import { PluginManager } from "./core/plugin/plugin-manager";
import { StorageService } from "./core/storage-service";
import { buildRouter } from "./router";

export interface MainAppOptions {
  plugins?: MainPlugin[];
}

export class MainApp implements IMainApp {
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  readonly windowManager: IBrowserWindowManager;
  private readonly storage: StorageService;
  #router: AnyRouter | null = null;

  get router(): AnyRouter {
    if (!this.#router) throw new Error("MainApp.start() must be called first");
    return this.#router;
  }

  constructor(options: MainAppOptions) {
    this.pluginManager = new PluginManager(options.plugins ?? []);
    this.windowManager = new BrowserWindowManager();
    this.storage = new StorageService();
  }

  getStorage(): StorageService {
    return this.storage;
  }

  async start(): Promise<void> {
    const ctx = { app: this, orpcServer: os };
    await this.pluginManager.configContributions(ctx);
    await this.pluginManager.activate(ctx);
    this.#router = buildRouter(this.pluginManager.contributions.routers);
    this.windowManager.createMainWindow();
  }

  async stop(): Promise<void> {
    this.storage.dispose();
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
  }
}
