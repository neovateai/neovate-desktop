import debug from "debug";

import type { I18nContributions } from "../i18n";
import type { PluginContext, RendererPlugin, RendererPluginHooks } from "./types";

import { buildContributions, PluginContributions, type WindowContribution } from "./contributions";

const log = debug("neovate:plugin");

type HookFn = (...args: unknown[]) => unknown;

export class PluginManager {
  readonly #plugins: RendererPlugin[];
  contributions: Required<PluginContributions> = buildContributions([]);
  private _windowContributions: WindowContribution[] = [];
  get windowContributions(): readonly WindowContribution[] {
    return this._windowContributions;
  }

  constructor(rawPlugins: RendererPlugin[] = []) {
    this.#plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly RendererPlugin[] {
    return this.#plugins;
  }

  /** Collect i18n contributions from all plugins */
  async configI18n(): Promise<I18nContributions[]> {
    return this.applyParallel("configI18n");
  }

  /** Collect window contributions from all plugins (sequential, deduplicates by windowType) */
  async configWindowContributions(): Promise<void> {
    log("configWindowContributions");
    const seen = new Map<string, string>();
    const result: WindowContribution[] = [];
    for (const plugin of this.#plugins) {
      if (typeof plugin.configWindowContributions !== "function") continue;
      const contributions = await plugin.configWindowContributions();
      for (const w of contributions) {
        const existing = seen.get(w.windowType);
        if (existing) {
          log(
            `plugin "${plugin.name}" registers duplicate window type "${w.windowType}" (already registered by "${existing}"), skipping`,
          );
          continue;
        }
        seen.set(w.windowType, plugin.name);
        result.push(w);
      }
    }
    this._windowContributions = result;
  }

  /** Collect and merge configContributions from all plugins (parallel) */
  // TODO: preserve plugin origin (plugin.name) per contribution item,
  // so NLS markers like %key% can auto-resolve to %namespace:key% without
  // plugins having to write the namespace prefix themselves.
  async configContributions(): Promise<void> {
    log("configContributions", { pluginCount: this.#plugins.length });
    const results = await this.applyParallel("configContributions");
    this.contributions = buildContributions(results);
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    log("activate", { pluginCount: this.#plugins.length });
    await this.applySeries("activate", ctx);
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
    log("deactivate");
    await this.applySeries("deactivate");
  }

  // ─── Hook Runners ─────────────────────────────────────────────────

  /** Run hook sequentially on all plugins (enforce order) */
  private async applySeries<K extends keyof RendererPluginHooks>(
    hook: K,
    ...args: Parameters<RendererPluginHooks[K]>
  ): Promise<void> {
    for (const plugin of this.#plugins) {
      const fn = plugin[hook] as HookFn | undefined;
      if (typeof fn === "function") {
        await fn.call(plugin, ...args);
      }
    }
  }

  /** Run hook on all plugins in parallel, collect results */
  private async applyParallel<K extends keyof RendererPluginHooks>(
    hook: K,
    ...args: Parameters<RendererPluginHooks[K]>
  ): Promise<Awaited<ReturnType<RendererPluginHooks[K]>>[]> {
    const promises = this.#plugins
      .filter((plugin) => typeof plugin[hook] === "function")
      .map((plugin) => {
        const fn = plugin[hook] as HookFn;
        return fn.call(plugin, ...args);
      });
    return Promise.all(promises) as Promise<Awaited<ReturnType<RendererPluginHooks[K]>>[]>;
  }
}
