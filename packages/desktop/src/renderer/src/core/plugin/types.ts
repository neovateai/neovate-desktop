import type { I18nContributions } from "../i18n/i18next";
import type { IRendererApp } from "../types";
import type { PluginContributions, WindowContribution } from "./contributions";

export interface PluginContext {
  app: IRendererApp;
  orpcClient: Record<string, unknown>;
}

export interface RendererPluginHooks {
  /** Return UI contributions — collected and merged before render */
  configContributions(ctx: PluginContext): PluginContributions;

  /** Return window type contributions — custom window root components */
  configWindowContributions(): WindowContribution[];

  /** Return i18n contributions — lazy-loaded translation namespaces */
  configI18n(): I18nContributions;

  /** Called after contributions collected, before React render */
  activate(ctx: PluginContext): void | Promise<void>;

  /** Called on app shutdown */
  deactivate(): void;
}

export type RendererPlugin = {
  name: string;
  enforce?: "pre" | "post";
} & Partial<RendererPluginHooks>;
