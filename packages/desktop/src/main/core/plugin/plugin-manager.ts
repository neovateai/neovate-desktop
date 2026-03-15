import debug from "debug";

import type { MainPlugin, PluginContext } from "./types";

import { buildContributions, EMPTY_CONTRIBUTIONS, type Contributions } from "./contributions";

const log = debug("neovate:plugin");

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
    log("configContributions", { pluginCount: this.#plugins.length });
    const pluginsWithHook = this.#plugins.filter(
      (p) => typeof p.configContributions === "function",
    );
    const items = await Promise.all(
      pluginsWithHook.map(async (p) => ({ name: p.name, ...(await p.configContributions!(ctx)) })),
    );
    this.contributions = buildContributions(items);
  }

  async activate(ctx: PluginContext): Promise<void> {
    log("activate start", { pluginCount: this.#plugins.length });
    for (const plugin of this.#plugins) {
      if (typeof plugin.activate === "function") {
        log("activate plugin", { name: plugin.name });
        await plugin.activate(ctx);
      }
    }
    log("activate done");
  }

  async deactivate(): Promise<void> {
    log("deactivate start");
    for (const plugin of this.#plugins) {
      if (typeof plugin.deactivate === "function") {
        log("deactivate plugin", { name: plugin.name });
        await plugin.deactivate();
      }
    }
    log("deactivate done");
  }
}
