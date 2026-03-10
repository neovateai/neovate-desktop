import type { AnyRouter } from "@orpc/server";

import { os } from "@orpc/server";

import type { IMainApp } from "../types";

export interface PluginContext {
  app: IMainApp;
  /** Host's oRPC builder — use this instead of importing @orpc/server directly to avoid version mismatch */
  orpcServer: typeof os;
}

export interface PluginContributions {
  router?: AnyRouter;
}

export interface MainPluginHooks {
  configContributions(ctx: PluginContext): PluginContributions | Promise<PluginContributions>;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate(): void | Promise<void>;
}

export type MainPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<MainPluginHooks>;
