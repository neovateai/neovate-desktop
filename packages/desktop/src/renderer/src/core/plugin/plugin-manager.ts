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
  private readonly plugins: RendererPlugin[];
  contributions: Required<PluginContributions> = EMPTY_CONTRIBUTIONS;

  constructor(rawPlugins: RendererPlugin[] = []) {
    this.plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly RendererPlugin[] {
    return this.plugins;
  }

  /** Collect and merge configContributions from all plugins (parallel) */
  async configContributions(): Promise<void> {
    const results = await Promise.all(
      this.plugins.map((plugin) => plugin.configContributions?.()),
    );
    this.contributions = mergeContributions(
      results.filter((r): r is PluginContributions => r != null),
    );
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.activate?.(ctx);
    }
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.deactivate?.();
    }
  }
}
