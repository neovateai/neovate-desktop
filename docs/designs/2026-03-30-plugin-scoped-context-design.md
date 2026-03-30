# Plugin Contribution Metadata Design

## Goal

Every contribution item knows which plugin it came from. Today `buildViewContributions` / `buildContributions` merge all plugin outputs into flat arrays — plugin origin is lost. After this change, every item is wrapped in `Contribution<T>` which carries a direct reference to the plugin that provided it.

## Non-Goals

- Plugin scoped context (logger, storage, registry) — separate future concern
- Changes to existing plugin code — plugins keep returning plain objects
- Shared `Contribution<T>` across main/renderer — each process has its own

## Design

### `Contribution<T>`

```typescript
// src/renderer/src/core/plugin/contribution.ts (same pattern for main)
import type { RendererPlugin } from "./types";

export interface Contribution<T> {
  readonly plugin: RendererPlugin;
  readonly value: T;
}

export function contribution<T>(plugin: RendererPlugin, value: T): Contribution<T> {
  return { plugin, value };
}
```

### Property Types on `PluginManager`

Derived from the plugin contribution interfaces — adding a field to `PluginViewContributions` automatically requires it to be populated in `configViewContributions`:

```typescript
type ElementOf<T> = T extends (infer E)[] ? E : never;

type ViewContributions = {
  [K in keyof Required<PluginViewContributions>]: Contribution<
    ElementOf<Required<PluginViewContributions>[K]>
  >[];
};

type Contributions = {
  [K in keyof Required<PluginContributions>]: Contribution<
    ElementOf<Required<PluginContributions>[K]>
  >[];
};
```

### Upgrade `applyParallel` return type

Filter first, run in parallel, then zip results with their source plugins:

```typescript
private async applyParallel<K extends keyof RendererPluginHooks>(
  hook: K,
  ...args: Parameters<RendererPluginHooks[K]>
): Promise<{ plugin: RendererPlugin; raw: Awaited<ReturnType<RendererPluginHooks[K]>> }[]> {
  const active = this.#plugins.filter((p) => typeof p[hook] === "function");
  const raws = (await Promise.all(
    active.map((p) => (p[hook] as HookFn).call(p, ...args)),
  )) as Awaited<ReturnType<RendererPluginHooks[K]>>[];
  return active.map((plugin, i) => ({ plugin, raw: raws[i]! }));
}
```

`applySeries` stays void — `activate` / `deactivate` return nothing.

### `collect` helper

Extracts an array field from entries and wraps each item as `Contribution<T>`:

```typescript
function collect<C, K extends keyof C>(
  entries: { plugin: RendererPlugin; raw: C }[],
  field: K,
): Contribution<ElementOf<NonNullable<C[K]>>>[] {
  return entries.flatMap((e) =>
    ((e.raw[field] ?? []) as ElementOf<NonNullable<C[K]>>[]).map((item) =>
      contribution(e.plugin, item),
    ),
  );
}
```

---

## Renderer Config Hooks

### `configViewContributions()`

```typescript
async configViewContributions(): Promise<void> {
  const entries = await this.applyParallel("configViewContributions");
  this.viewContributions = {
    activityBarItems: sortByOrder(collect(entries, "activityBarItems")),
    secondarySidebarViews: collect(entries, "secondarySidebarViews"),
    contentPanelViews: collect(entries, "contentPanelViews"),
    primaryTitlebarItems: sortByOrder(collect(entries, "primaryTitlebarItems")),
    secondaryTitlebarItems: sortByOrder(collect(entries, "secondaryTitlebarItems")),
  };
}
```

### `configContributions(ctx)`

```typescript
async configContributions(ctx: PluginContext): Promise<void> {
  const entries = await this.applyParallel("configContributions", ctx);
  this.contributions = {
    providerTemplates: deduplicateById(collect(entries, "providerTemplates")),
    externalUriOpeners: collect(entries, "externalUriOpeners"),
  };
}
```

### `configWindowContributions()`

Keep existing sequential loop, wrap each item:

```typescript
result.push(contribution(plugin, w)); // was: result.push(w)
```

### `configI18n()`

```typescript
async configI18n(): Promise<I18nContributions[]> {
  return (await this.applyParallel("configI18n")).map((e) => e.raw);
}
```

### Utilities

```typescript
const sortByOrder = <T extends { order?: number }>(list: Contribution<T>[]) =>
  list.toSorted((a, b) => (a.value.order ?? Infinity) - (b.value.order ?? Infinity));

function deduplicateById<T extends { id: string }>(items: Contribution<T>[]): Contribution<T>[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    if (seen.has(c.value.id)) {
      log("duplicate id=%s from plugin=%s, skipping", c.value.id, c.plugin.name);
      return false;
    }
    seen.add(c.value.id);
    return true;
  });
}
```

---

## Main Process

Same pattern inline in `configContributions`. Plugin names must be unique — the constructor enforces this with a duplicate-name guard:

```typescript
async configContributions(ctx: PluginContext): Promise<void> {
  const entries = await this.applyParallel("configContributions", ctx);
  const routers: Contribution<AnyRouter>[] = [];
  for (const { plugin, raw } of entries) {
    if (raw.router) routers.push(contribution(plugin, raw.router));
  }
  this.contributions = { routers };
}
```

`buildRouter` uses `plugin.name` as the oRPC namespace key:

```typescript
export function buildRouter(pluginRouters: Contribution<AnyRouter>[]) {
  return {
    // ...built-in routes...
    ...Object.fromEntries(pluginRouters.map((c) => [c.plugin.name, c.value])),
  };
}
```

---

## Consumer Pattern

```typescript
for (const { value: view, plugin } of viewContributions.secondarySidebarViews) {
  // plugin.name available when needed
}
```

## Files Changed

| File                                                     | Change                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/renderer/src/core/plugin/contribution.ts`           | **New** — `Contribution<T>` + `contribution()`                                                |
| `src/renderer/src/core/plugin/contributions.ts`          | Remove `buildViewContributions` / `buildContributions`, add `sortByOrder` / `deduplicateById` |
| `src/renderer/src/core/plugin/plugin-manager.ts`         | Upgrade `applyParallel`, inline building                                                      |
| `src/renderer/src/core/__tests__/plugin-manager.test.ts` | Update assertions                                                                             |
| ~10 renderer consumer files                              | Access `.value.*`                                                                             |
| `src/main/core/plugin/contribution.ts`                   | **New** — `Contribution<T>` + `contribution()`                                                |
| `src/main/core/plugin/contributions.ts`                  | Remove `buildContributions`                                                                   |
| `src/main/core/plugin/plugin-manager.ts`                 | Inline contribution building                                                                  |
| `src/main/router.ts`                                     | Unwrap `Contribution<AnyRouter>`                                                              |
| `src/main/core/plugin/__tests__/plugin-manager.test.ts`  | Update assertions                                                                             |
| Existing plugins                                         | **No changes**                                                                                |
