import { buildContributions, PluginContributions, type WindowContribution } from "./contributions";
import type { I18nContributions } from "../i18n";
import type { PluginContext, RendererPlugin, RendererPluginHooks } from "./types";

type HookFn = (...args: unknown[]) => unknown;

export class PluginManager {
  readonly #plugins: RendererPlugin[];
  contributions: Required<PluginContributions> = buildContributions([]);

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

  /** Collect window contributions from all plugins (parallel) */
  async configWindowContributions(): Promise<WindowContribution[]> {
    const results = await this.applyParallel("configWindowContributions");
    const seen = new Set<string>();
    return results.flat().filter((w) => {
      if (seen.has(w.windowType)) {
        console.warn(`Duplicate window type: "${w.windowType}", skipping`);
        return false;
      }
      seen.add(w.windowType);
      return true;
    });
  }

  /** Collect and merge configContributions from all plugins (parallel) */
  async configContributions(): Promise<void> {
    const results = await this.applyParallel("configContributions");
    this.contributions = buildContributions(results);
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    await this.applySeries("activate", ctx);
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
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
