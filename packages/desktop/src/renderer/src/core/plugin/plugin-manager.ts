import type { PluginContributions } from "./contributions";
import type { PluginContext, RendererPlugin } from "./types";

const EMPTY_CONTRIBUTIONS: Required<PluginContributions> = {
  activityBarItems: [],
  secondarySidebarPanels: [],
  contentPanels: [],
  primaryTitlebarItems: [],
  secondaryTitlebarItems: [],
};

function mergeContributions(items: PluginContributions[]): Required<PluginContributions> {
  const sortByOrder = <T extends { order?: number }>(list: T[]) =>
    list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return {
    activityBarItems: sortByOrder(
      items.flatMap((r) => r.activityBarItems ?? []),
    ),
    secondarySidebarPanels: items.flatMap(
      (r) => r.secondarySidebarPanels ?? [],
    ),
    contentPanels: items.flatMap((r) => r.contentPanels ?? []),
    primaryTitlebarItems: sortByOrder(
      items.flatMap((r) => r.primaryTitlebarItems ?? []),
    ),
    secondaryTitlebarItems: sortByOrder(
      items.flatMap((r) => r.secondaryTitlebarItems ?? []),
    ),
  };
}

export class PluginManager {
  readonly #plugins: RendererPlugin[];
  contributions: Required<PluginContributions> = EMPTY_CONTRIBUTIONS;

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

  /** Collect and merge configContributions from all plugins (parallel) */
  async configContributions(): Promise<void> {
    const results = await this.applyParallel(
      (plugin) => plugin.configContributions?.(),
    );
    this.contributions = mergeContributions(results);
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    await this.applySeries((plugin) => plugin.activate?.(ctx));
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
    await this.applySeries((plugin) => plugin.deactivate?.());
  }

  // ─── Hook Runners ─────────────────────────────────────────────────

  /** Run callback on first plugin that returns a non-null result */
  private async applyFirst<T>(
    fn: (plugin: RendererPlugin) => T | undefined,
  ): Promise<NonNullable<Awaited<T>> | undefined> {
    for (const plugin of this.#plugins) {
      const result = await fn(plugin);
      if (result != null) {
        return result as NonNullable<Awaited<T>>;
      }
    }
    return undefined;
  }

  /** Run callback sequentially on all plugins (enforce order) */
  private async applySeries(
    fn: (plugin: RendererPlugin) => void | Promise<void>,
  ): Promise<void> {
    for (const plugin of this.#plugins) {
      await fn(plugin);
    }
  }

  /** Run callback on all plugins in parallel, collect non-null results */
  private async applyParallel<T>(
    fn: (plugin: RendererPlugin) => T | undefined,
  ): Promise<NonNullable<Awaited<T>>[]> {
    const results = await Promise.all(this.#plugins.map(fn));
    return results.filter(
      (r): r is NonNullable<Awaited<T>> => r != null,
    );
  }
}
