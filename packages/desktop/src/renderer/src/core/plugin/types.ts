import type { PluginContributions } from "./contributions";
import type { IRendererApp } from "../types";

export interface PluginContext {
  app: IRendererApp;
  orpcClient: Record<string, unknown>;
}

export interface RendererPluginHooks {
  /** Return UI contributions — collected and merged before render */
  configContributions(): PluginContributions;

  /** Called after contributions collected, before React render */
  activate(ctx: PluginContext): void | Promise<void>;

  /** Called on app shutdown */
  deactivate(): void;
}

export type RendererPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<RendererPluginHooks>;
