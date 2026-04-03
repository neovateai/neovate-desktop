import type { AnyRouter } from "@orpc/server";
import type { AnalyticsInstance, AnalyticsPlugin } from "analytics";

import { os } from "@orpc/server";
import { Analytics } from "analytics";
import debug from "debug";

import type { ILlmService } from "../shared/features/llm/types";
import type { MainPlugin } from "./core/plugin/types";
import type { IBrowserWindowManager, IMainApp } from "./core/types";

import { BrowserWindowManager } from "./core";
import { DeeplinkService } from "./core/deeplink/deeplink-service";
import { DisposableStore } from "./core/disposable";
import { PluginManager } from "./core/plugin/plugin-manager";
import { shellEnvService } from "./core/shell-service";
import { StorageService } from "./core/storage-service";
import { buildRouter } from "./router";

const log = debug("neovate:startup");

export interface MainAppOptions {
  appName: string;
  plugins?: MainPlugin[];
  llmService?: ILlmService;
  analyticsPlugins?: AnalyticsPlugin[];
}

export class MainApp implements IMainApp {
  readonly analytics: AnalyticsInstance;
  readonly pluginManager: PluginManager;
  readonly subscriptions = new DisposableStore();
  readonly windowManager: IBrowserWindowManager;
  readonly deeplink: DeeplinkService;
  private readonly storage: StorageService;
  private readonly llmService: ILlmService;
  #router: AnyRouter | null = null;

  get router(): AnyRouter {
    if (!this.#router) throw new Error("MainApp.start() must be called first");
    return this.#router;
  }

  constructor(options: MainAppOptions) {
    this.analytics = Analytics({
      app: options.appName,
      plugins: options.analyticsPlugins ?? [],
    });
    this.pluginManager = new PluginManager(options.plugins ?? []);
    this.windowManager = new BrowserWindowManager();
    this.deeplink = new DeeplinkService();
    this.storage = new StorageService();
    // Fallback to a stub that always reports unavailable
    this.llmService = options.llmService ?? {
      isAvailable: () => Promise.resolve(false),
      query: () => Promise.reject(new Error("LLM service not available")),
      queryMessages: () => Promise.reject(new Error("LLM service not available")),
    };
  }

  getStorage(): StorageService {
    return this.storage;
  }

  async start(): Promise<void> {
    const t0 = performance.now();
    const el = () => `${Math.round(performance.now() - t0)}ms`;
    const ctx = { app: this, orpcServer: os, shell: shellEnvService, llm: this.llmService };
    await this.pluginManager.configContributions(ctx);
    log("main configContributions done %s", el());

    // Register plugin deeplink handlers (app-level handlers registered in index.ts before start())
    for (const { plugin, value } of this.pluginManager.contributions.deeplinkHandlers) {
      this.deeplink.register(plugin.name, value);
    }

    await this.pluginManager.activate(ctx);
    log("main activate done %s", el());
    this.#router = buildRouter(this.pluginManager.contributions.routers);
    log("main router built %s", el());
    this.windowManager.createMainWindow();
    log("main window created %s", el());

    // Flush buffered deeplinks — events queue in pending if no subscriber yet
    await this.deeplink.activate();
    log("deeplink activated %s", el());
  }

  async stop(): Promise<void> {
    this.deeplink.dispose();
    this.storage.dispose();
    await this.pluginManager.deactivate();
    this.windowManager.destroyAll();
    this.subscriptions.dispose();
  }
}
