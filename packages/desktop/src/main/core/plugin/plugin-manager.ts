import type { MainPlugin, PluginContext } from "./types";

import { buildContributions, EMPTY_CONTRIBUTIONS, type Contributions } from "./contributions";

export class PluginManager {
  readonly #plugins: MainPlugin[];
  contributions: Contributions = EMPTY_CONTRIBUTIONS;

  constructor(rawPlugins: MainPlugin[] = []) {
    this.#plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly MainPlugin[] {
    return this.#plugins;
  }

  async configContributions(ctx: PluginContext): Promise<void> {
    const pluginsWithHook = this.#plugins.filter(
      (p) => typeof p.configContributions === "function",
    );
    const items = await Promise.all(
      pluginsWithHook.map(async (p) => ({ name: p.name, ...(await p.configContributions!(ctx)) })),
    );
    this.contributions = buildContributions(items);
  }

  async activate(ctx: PluginContext): Promise<void> {
    for (const plugin of this.#plugins) {
      if (typeof plugin.activate === "function") {
        await plugin.activate(ctx);
      }
    }
  }

  async deactivate(): Promise<void> {
    for (const plugin of this.#plugins) {
      if (typeof plugin.deactivate === "function") {
        await plugin.deactivate();
      }
    }
  }
}
