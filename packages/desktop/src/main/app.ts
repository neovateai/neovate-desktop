import type { AnyRouter } from "@orpc/server";

import { os } from "@orpc/server";
import debug from "debug";

import type { MainPlugin } from "./core/plugin/types";
import type { IBrowserWindowManager, IMainApp } from "./core/types";

import { BrowserWindowManager } from "./core";
import { DisposableStore } from "./core/disposable";
import { PluginManager } from "./core/plugin/plugin-manager";
import { shellEnvService } from "./core/shell-service";
import { StorageService } from "./core/storage-service";
import { buildRouter } from "./router";

const log = debug("neovate:startup");

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
    const t0 = performance.now();
    const el = () => `${Math.round(performance.now() - t0)}ms`;
    const ctx = { app: this, orpcServer: os, shell: shellEnvService };
    await this.pluginManager.configContributions(ctx);
    log("main configContributions done %s", el());
    await this.pluginManager.activate(ctx);
    log("main activate done %s", el());
    this.#router = buildRouter(this.pluginManager.contributions.routers);
    log("main router built %s", el());
    this.windowManager.createMainWindow();
    log("main window created %s", el());
  }

  async stop(): Promise<void> {
    this.storage.dispose();
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
  }
}
