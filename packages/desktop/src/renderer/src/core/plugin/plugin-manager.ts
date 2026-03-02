import type { PluginContributions } from "./contributions";
import type { PluginContext, RendererPlugin, RendererPluginHooks } from "./types";

// ─── Hook Type Helpers ──────────────────────────────────────────────

type H = RendererPluginHooks;

/** Extract `this` context type from hook function */
type HookContext<K extends keyof H> = H[K] extends (
  this: infer C,
  ...args: never[]
) => unknown
  ? C
  : unknown;

/** Extract argument types from hook function (excluding `this`) */
type HookArgs<K extends keyof H> = H[K] extends (
  this: unknown,
  ...args: infer A
) => unknown
  ? A
  : H[K] extends (...args: infer A) => unknown
    ? A
    : never;

/** Extract return type from hook function (awaited) */
type HookReturn<K extends keyof H> = H[K] extends (
  ...args: never[]
) => infer R
  ? Awaited<R>
  : never;

/** Extract first argument type from hook function */
type FirstArg<K extends keyof H> = HookArgs<K> extends [
  infer F,
  ...unknown[],
]
  ? F
  : never;

/** Extract rest arguments (excluding first) from hook function */
type RestArgs<K extends keyof H> = HookArgs<K> extends [
  unknown,
  ...infer R,
]
  ? R
  : [];

/** Check if hook is a valid accumulator: first arg type === return type */
type IsAccumulator<K extends keyof H> = [FirstArg<K>] extends [
  HookReturn<K>,
]
  ? [HookReturn<K>] extends [FirstArg<K>]
    ? true
    : false
  : false;

// ─── Contribution Merging ───────────────────────────────────────────

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

// ─── PluginManager ──────────────────────────────────────────────────

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
    const results = await this.applyParallel("configContributions", undefined);
    this.contributions = mergeContributions(
      results.filter((r): r is PluginContributions => r != null),
    );
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    await this.applySeries("activate", undefined, ctx);
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
    await this.applySeries("deactivate", undefined);
  }

  // ─── Hook Execution ─────────────────────────────────────────────

  /** Apply hook to get first non-null/undefined result */
  private async applyFirst<K extends keyof H>(
    hook: K,
    context: HookContext<K>,
    ...args: HookArgs<K>
  ): Promise<HookReturn<K> | undefined> {
    for (const plugin of this.plugins) {
      const fn = plugin[hook];
      if (typeof fn === "function") {
        const result = await fn.call(context, ...args);
        if (result != null) {
          return result as HookReturn<K>;
        }
      }
    }
    return undefined;
  }

  /** Apply hook sequentially to all plugins */
  private async applySeries<K extends keyof H>(
    hook: K,
    context: HookContext<K>,
    ...args: HookArgs<K>
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin[hook];
      if (typeof fn === "function") {
        await fn.call(context, ...args);
      }
    }
  }

  /** Apply hook to all plugins in parallel */
  private async applyParallel<K extends keyof H>(
    hook: K,
    context: HookContext<K>,
    ...args: HookArgs<K>
  ): Promise<HookReturn<K>[]> {
    const promises = this.plugins
      .filter((plugin) => typeof plugin[hook] === "function")
      .map((plugin) => {
        const fn = plugin[hook] as (...a: unknown[]) => unknown;
        return fn.call(context, ...args);
      });

    return Promise.all(promises) as Promise<HookReturn<K>[]>;
  }

  /**
   * Apply hook sequentially, passing accumulated result to each plugin.
   * Hook signature must satisfy: (current: T, ...rest) => T (first arg === return type)
   */
  private async applySeriesLast<K extends keyof H>(
    hook: IsAccumulator<K> extends true ? K : never,
    context: HookContext<K>,
    initial: FirstArg<K>,
    ...rest: RestArgs<K>
  ): Promise<HookReturn<K>> {
    let result: FirstArg<K> = initial;

    for (const plugin of this.plugins) {
      const fn = plugin[hook as K];
      if (typeof fn === "function") {
        const newResult = await fn.call(context, result, ...rest);
        if (newResult != null) {
          result = newResult as FirstArg<K>;
        }
      }
    }

    return result as HookReturn<K>;
  }
}
