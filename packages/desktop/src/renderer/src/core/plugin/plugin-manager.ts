import debug from "debug";

import type { ProviderTemplate } from "../../../../shared/features/provider/built-in";
import type { ExternalUriOpenerContribution } from "../external-uri-opener";
import type { I18nContributions } from "../i18n";
import type { PluginContext, RendererPlugin, RendererPluginHooks } from "./types";

import { contribution, type Contribution } from "./contribution";
import {
  deduplicateById,
  sortByOrder,
  type ActivityBarItem,
  type ContentPanelView,
  type SecondarySidebarView,
  type TitlebarItem,
  type WindowContribution,
} from "./contributions";

const log = debug("neovate:plugin");

type HookFn = (...args: unknown[]) => unknown;

type ViewContributions = {
  activityBarItems: Contribution<ActivityBarItem>[];
  secondarySidebarViews: Contribution<SecondarySidebarView>[];
  contentPanelViews: Contribution<ContentPanelView>[];
  primaryTitlebarItems: Contribution<TitlebarItem>[];
  secondaryTitlebarItems: Contribution<TitlebarItem>[];
};

type Contributions = {
  providerTemplates: Contribution<ProviderTemplate>[];
  externalUriOpeners: Contribution<ExternalUriOpenerContribution>[];
};

export class PluginManager {
  readonly #plugins: RendererPlugin[];
  viewContributions: ViewContributions = {
    activityBarItems: [],
    secondarySidebarViews: [],
    contentPanelViews: [],
    primaryTitlebarItems: [],
    secondaryTitlebarItems: [],
  };
  contributions: Contributions = {
    providerTemplates: [],
    externalUriOpeners: [],
  };
  private _windowContributions: Contribution<WindowContribution>[] = [];
  get windowContributions(): readonly Contribution<WindowContribution>[] {
    return this._windowContributions;
  }

  constructor(rawPlugins: RendererPlugin[] = []) {
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

  getPlugins(): readonly RendererPlugin[] {
    return this.#plugins;
  }

  /** Collect i18n contributions from all plugins */
  async configI18n(): Promise<I18nContributions[]> {
    return (await this.applyParallel("configI18n")).map((e) => e.raw);
  }

  /** Collect window contributions from all plugins (sequential, deduplicates by windowType) */
  async configWindowContributions(): Promise<void> {
    log("configWindowContributions");
    const seen = new Map<string, string>();
    const result: Contribution<WindowContribution>[] = [];
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
        result.push(contribution(plugin, w));
      }
    }
    this._windowContributions = result;
  }

  /** Collect and merge view contributions from all plugins (parallel) */
  async configViewContributions(): Promise<void> {
    log("configViewContributions", { pluginCount: this.#plugins.length });
    const entries = await this.applyParallel("configViewContributions");
    this.viewContributions = {
      activityBarItems: sortByOrder(
        entries.flatMap((e) =>
          (e.raw.activityBarItems ?? []).map((item) => contribution(e.plugin, item)),
        ),
      ),
      secondarySidebarViews: entries.flatMap((e) =>
        (e.raw.secondarySidebarViews ?? []).map((item) => contribution(e.plugin, item)),
      ),
      contentPanelViews: entries.flatMap((e) =>
        (e.raw.contentPanelViews ?? []).map((item) => contribution(e.plugin, item)),
      ),
      primaryTitlebarItems: sortByOrder(
        entries.flatMap((e) =>
          (e.raw.primaryTitlebarItems ?? []).map((item) => contribution(e.plugin, item)),
        ),
      ),
      secondaryTitlebarItems: sortByOrder(
        entries.flatMap((e) =>
          (e.raw.secondaryTitlebarItems ?? []).map((item) => contribution(e.plugin, item)),
        ),
      ),
    };
  }

  /** Collect and merge data contributions from all plugins (parallel) */
  async configContributions(ctx: PluginContext): Promise<void> {
    log("configContributions", { pluginCount: this.#plugins.length });
    const entries = await this.applyParallel("configContributions", ctx);
    this.contributions = {
      providerTemplates: deduplicateById(
        entries.flatMap((e) =>
          (e.raw.providerTemplates ?? []).map((item) => contribution(e.plugin, item)),
        ),
      ),
      externalUriOpeners: entries.flatMap((e) =>
        (e.raw.externalUriOpeners ?? []).map((item) => contribution(e.plugin, item)),
      ),
    };
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

  /** Run hook on all plugins in parallel, zip results with source plugin */
  private async applyParallel<K extends keyof RendererPluginHooks>(
    hook: K,
    ...args: Parameters<RendererPluginHooks[K]>
  ): Promise<{ plugin: RendererPlugin; raw: Awaited<ReturnType<RendererPluginHooks[K]>> }[]> {
    const active = this.#plugins.filter((p) => typeof p[hook] === "function");
    const raws = (await Promise.all(
      active.map((p) => (p[hook] as HookFn).call(p, ...args)),
    )) as Awaited<ReturnType<RendererPluginHooks[K]>>[];
    // raws[i]! is safe: active and raws are co-derived from the same Promise.all, lengths always equal
    return active.map((plugin, i) => ({ plugin, raw: raws[i]! }));
  }
}
