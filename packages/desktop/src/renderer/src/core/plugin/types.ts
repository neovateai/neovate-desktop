import type { PluginContributions } from "./contributions";
import type { Disposable } from "../disposable";

/** Plugin layer interface — RendererApp implements this */
export interface IRendererApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
}

export interface PluginContext {
  app: IRendererApp;
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
