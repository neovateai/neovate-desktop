import type { AnyRouter } from "@orpc/server";

import debug from "debug";

import type { DeeplinkHandler } from "../deeplink/types";
import type { AgentContributions } from "./contributions";
import type { MainPlugin, MainPluginHooks, PluginContext } from "./types";

import { contribution, type Contribution } from "./contribution";
import { type Contributions } from "./contributions";

const log = debug("neovate:plugin");

type HookFn = (...args: unknown[]) => unknown;

export class PluginManager {
  readonly #plugins: MainPlugin[];
  contributions: Contributions = { routers: [], agents: [], deeplinkHandlers: [] };

  constructor(rawPlugins: MainPlugin[] = []) {
    const names = new Set<string>();
    for (const p of rawPlugins) {
      if (names.has(p.name)) throw new Error(`Duplicate plugin name: "${p.name}"`);
      names.add(p.name);
    }
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
    const entries = await this.applyParallel("configContributions", ctx);
    const routers: Contribution<AnyRouter>[] = [];
    const agents: Contribution<AgentContributions>[] = [];
    const deeplinkHandlers: Contribution<DeeplinkHandler>[] = [];
    for (const { plugin, raw } of entries) {
      if (raw.router) routers.push(contribution(plugin, raw.router));
      if (raw.agents) agents.push(contribution(plugin, raw.agents));
      if (raw.deeplinkHandler) deeplinkHandlers.push(contribution(plugin, raw.deeplinkHandler));
    }
    this.contributions = { routers, agents, deeplinkHandlers };
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

  // ─── Hook Runners ─────────────────────────────────────────────────

  /** Run hook on all plugins in parallel, zip results with source plugin */
  private async applyParallel<K extends keyof MainPluginHooks>(
    hook: K,
    ...args: Parameters<MainPluginHooks[K]>
  ): Promise<{ plugin: MainPlugin; raw: Awaited<ReturnType<MainPluginHooks[K]>> }[]> {
    const active = this.#plugins.filter((p) => typeof p[hook] === "function");
    const raws = (await Promise.all(
      active.map((p) => (p[hook] as HookFn).call(p, ...args)),
    )) as Awaited<ReturnType<MainPluginHooks[K]>>[];
    // raws[i]! is safe: active and raws are co-derived from the same Promise.all, lengths always equal
    return active.map((plugin, i) => ({ plugin, raw: raws[i]! }));
  }
}
