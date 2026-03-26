---
date: 2026-03-25
topic: config-view-contributions
---

# Split View Contributions from `configContributions`

## What We're Building

Introduce a dedicated `configViewContributions()` hook on `RendererPlugin` to separate UI/view registrations from data/config contributions. This is a pure separation-of-concerns refactor — no behavioral changes.

## Why This Approach

Today, `configContributions()` mixes two concerns:

1. **View registrations** — activity bar items, sidebar views, content panel views, titlebar items (UI shell slots)
2. **Data contributions** — provider templates (and future: commands, keybindings, menus)

These have different conceptual roles and will likely diverge in how they're processed (e.g., view contributions may need layout-aware merging, while data contributions need deduplication). Splitting them now keeps each hook focused and makes the plugin API clearer as we add more contribution types.

## Design

### New Types

```ts
// contributions.ts

/** View/UI contributions — things that register visual slots */
export interface PluginViewContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarViews?: SecondarySidebarView[];
  contentPanelViews?: ContentPanelView[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}

/** Data/config contributions — non-visual registrations */
export interface PluginContributions {
  providerTemplates?: ProviderTemplate[];
}
```

### New Hook

```ts
// types.ts — RendererPluginHooks

export interface RendererPluginHooks {
  /** Return view/UI contributions — activity bar, sidebar, content panel, titlebar */
  configViewContributions(): PluginViewContributions;

  /** Return data contributions — provider templates, future commands/keybindings */
  configContributions(): PluginContributions;

  /** (unchanged) */
  configWindowContributions(): WindowContribution[];
  configI18n(): I18nContributions;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate(): void;
}
```

### New Merge Function

```ts
// contributions.ts

export function buildViewContributions(
  items: (PluginViewContributions | null | undefined)[],
): Required<PluginViewContributions> {
  const valid = items.filter((r): r is PluginViewContributions => r != null);
  const sortByOrder = <T extends { order?: number }>(list: T[]) =>
    list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return {
    activityBarItems: sortByOrder(valid.flatMap((r) => r.activityBarItems ?? [])),
    secondarySidebarViews: valid.flatMap((r) => r.secondarySidebarViews ?? []),
    contentPanelViews: valid.flatMap((r) => r.contentPanelViews ?? []),
    primaryTitlebarItems: sortByOrder(valid.flatMap((r) => r.primaryTitlebarItems ?? [])),
    secondaryTitlebarItems: sortByOrder(valid.flatMap((r) => r.secondaryTitlebarItems ?? [])),
  };
}
```

### PluginManager Changes

```ts
// plugin-manager.ts

class PluginManager {
  contributions: Required<PluginContributions> = buildContributions([]);
  viewContributions: Required<PluginViewContributions> = buildViewContributions([]);

  async configViewContributions(): Promise<void> {
    const results = await this.applyParallel("configViewContributions");
    this.viewContributions = buildViewContributions(results);
  }

  async configContributions(): Promise<void> {
    const results = await this.applyParallel("configContributions");
    this.contributions = buildContributions(results);
  }
}
```

### Plugin Migration

Each renderer plugin moves view fields from `configContributions()` to `configViewContributions()`:

| Plugin               | Has view fields                                            | Has non-view fields | Migration                                                     |
| -------------------- | ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| `editor`             | contentPanelViews                                          | -                   | Move to `configViewContributions`, drop `configContributions` |
| `terminal`           | contentPanelViews                                          | -                   | Move to `configViewContributions`, drop `configContributions` |
| `git`                | activityBarItems, secondarySidebarViews, contentPanelViews | -                   | Move to `configViewContributions`, drop `configContributions` |
| `files`              | activityBarItems, secondarySidebarViews                    | -                   | Move to `configViewContributions`, drop `configContributions` |
| `changes`            | activityBarItems, secondarySidebarViews                    | -                   | Move to `configViewContributions`, drop `configContributions` |
| `search`             | activityBarItems, secondarySidebarViews                    | -                   | Move to `configViewContributions`, drop `configContributions` |
| `browser`            | contentPanelViews                                          | -                   | Move to `configViewContributions`, drop `configContributions` |
| `network`            | contentPanelViews                                          | -                   | Move to `configViewContributions`, drop `configContributions` |
| `debug`              | contentPanelViews                                          | -                   | Move to `configViewContributions`, drop `configContributions` |
| `content-panel-demo` | contentPanelViews, secondaryTitlebarItems                  | -                   | Move to `configViewContributions`, drop `configContributions` |
| `providers`          | -                                                          | providerTemplates   | Keep `configContributions` as-is                              |

### App Bootstrap Changes

Where the app calls `pluginManager.configContributions()` and reads `pluginManager.contributions`, add a parallel call to `pluginManager.configViewContributions()` and update consumers to read from `pluginManager.viewContributions`.

### What Stays Unchanged

- `configWindowContributions()` — remains its own hook (different lifecycle: sequential with dedup)
- `configI18n()` — remains its own hook
- Main process `MainPlugin` / `PluginContributions` — unaffected (only has `router`)
- No behavioral changes — same contributions reach the same UI, just via a different hook

## Files Changed

1. `src/renderer/src/core/plugin/contributions.ts` — new `PluginViewContributions` type, `buildViewContributions()`, slim `PluginContributions`
2. `src/renderer/src/core/plugin/types.ts` — add `configViewContributions` to `RendererPluginHooks`, update imports
3. `src/renderer/src/core/plugin/plugin-manager.ts` — add `viewContributions` property and `configViewContributions()` method, update `buildContributions` usage
4. `src/renderer/src/core/plugin/index.ts` — update re-exports
5. `src/renderer/src/core/app.tsx` — call `configViewContributions()`, pass `viewContributions` to consumers
6. `src/renderer/src/plugins/*/index.tsx` — migrate view fields (all plugins except `providers`)
7. `src/renderer/src/core/__tests__/plugin-manager.test.ts` — update tests
8. `src/renderer/src/core/__tests__/app.test.ts` — update tests

## Next Steps

-> `/workflows:plan` for implementation order and verification strategy
