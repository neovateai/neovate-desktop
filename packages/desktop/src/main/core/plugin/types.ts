import type { AnyRouter } from "@orpc/server";

import { os } from "@orpc/server";

import type { IShellService } from "../shell-service";
import type { IMainApp } from "../types";

/**
 * Context provided to plugins. Organized by layer:
 *
 * - **Application** — `app`, `orpcServer`: Neovate lifecycle, windows, IPC
 * - **System**      — `shell`: host OS capabilities (PATH, env vars)
 *
 * Each property is a namespace (not a flat API), so new capabilities
 * are added as methods within a namespace rather than new top-level properties.
 */
export interface PluginContext {
  /** Application lifecycle, windows, and configuration */
  app: IMainApp;
  /** Host's oRPC builder — use this instead of importing @orpc/server directly to avoid version mismatch */
  orpcServer: typeof os;
  /** System shell environment — resolves user's full PATH and env vars */
  shell: IShellService;
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
