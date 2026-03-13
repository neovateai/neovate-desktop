# Provider Plugin System

**Date:** 2026-03-13
**Status:** Approved

## Problem

`BUILT_IN_PROVIDERS` is a hardcoded array in `shared/features/provider/built-in.ts` containing 10 provider templates. Adding or removing providers requires modifying this shared file. This should be extensible through the existing plugin system so that internal plugin developers can contribute provider templates via `configContributions()`.

## Decision

**Approach A: Extend `PluginContributions` with `providerTemplates`**

Add a `providerTemplates?: ProviderTemplate[]` field to the renderer `PluginContributions` type (renderer-only — the main process never references provider templates). The existing `buildContributions()` merger handles flatMapping arrays from multiple plugins with deduplication by `id`. A new core `providers` plugin contains the current hardcoded array. The providers-panel reads from merged contributions instead of the constant.

### Why this approach

- Follows the exact pattern already established by `activityBarItems`, `contentPanelViews`, etc.
- Minimal change surface — one new field in renderer contribution types, one new plugin
- Single merge point via existing `buildContributions()`
- Type-safe, no new services or RPC endpoints needed
- Templates stay in `shared/` so both main and renderer can access them if needed

### Rejected alternatives

- **Separate Provider Registry Service:** Adds a standalone `ProviderTemplateRegistry` + new oRPC endpoint. More plumbing for equivalent result.
- **Event-based Registration:** Plugins emit `provider:register` events. Harder to type, timing-dependent, doesn't match existing patterns.

## Scope

- Plugins contribute **static `ProviderTemplate[]` data objects only** (renamed from `BuiltInProvider` — same shape)
- No custom auth flows, model discovery APIs, or custom benchmark logic in this iteration
- Target audience: internal plugin developers (not end-user file-based extensions)

## Design

### 1. Contribution type changes (renderer-only)

`renderer/src/core/plugin/contributions.ts`:

```typescript
export interface PluginContributions {
  // ... existing fields ...
  providerTemplates?: ProviderTemplate[]; // NEW
}
```

`buildContributions()` merges with **deduplication by `id`** (first-wins, matches `windowType` precedent):

```typescript
providerTemplates: deduplicateById(valid.flatMap((r) => r.providerTemplates ?? [])),
```

Where `deduplicateById` keeps the first occurrence of each `id` and logs a `debug` warning on duplicates:

```typescript
function deduplicateById(templates: ProviderTemplate[]): ProviderTemplate[] {
  const seen = new Set<string>();
  return templates.filter((t) => {
    if (seen.has(t.id)) {
      debug("duplicate providerTemplate id=%s, skipping", t.id);
      return false;
    }
    seen.add(t.id);
    return true;
  });
}
```

No changes to the main-side plugin types — provider templates are a renderer-only concern.

### 2. New core providers plugin

Create `renderer/src/plugins/providers/index.ts`:

```typescript
import type { RendererPlugin } from "../../core/plugin/types";
import { BUILT_IN_PROVIDER_TEMPLATES } from "../../../../shared/features/provider/templates";

export const providersPlugin: RendererPlugin = {
  name: "providers",
  configContributions() {
    return {
      providerTemplates: BUILT_IN_PROVIDER_TEMPLATES,
    };
  },
};
```

Create `shared/features/provider/templates.ts`:

- Moves the current `BUILT_IN_PROVIDERS` array here (renamed to `BUILT_IN_PROVIDER_TEMPLATES`)
- Lives in `shared/` so both main and renderer can access the data if needed in the future

### 3. Update `shared/features/provider/built-in.ts`

- **Remove** the `BUILT_IN_PROVIDERS` constant array (moved to `templates.ts`)
- **Remove** `getBuiltInProvider()` — it's a trivial one-liner `.find()` that callers can inline
- **Rename** `BuiltInProvider` type to `ProviderTemplate`
- **Keep** `ProviderTemplate` type, `L10nText` type, and `resolveL10n()` helper

### 4. Expose merged templates to the UI

The renderer `PluginManager` stores merged `buildContributions()` results in its public `contributions` property. UI components access them via the `useRendererApp()` hook:

```typescript
const app = useRendererApp();
const templates = app.pluginManager.contributions.providerTemplates;
```

This is the same pattern used by all existing contribution consumers:

- `activity-bar.tsx` reads `app.pluginManager.contributions.activityBarItems`
- `secondary-sidebar.tsx` reads `app.pluginManager.contributions.secondarySidebarViews`
- `content-panel.tsx` reads `app.pluginManager.contributions.contentPanelViews`

No new context or hook needed — `providerTemplates` is just another field on the same object.

### 5. Update providers-panel.tsx

- Replace `import { BUILT_IN_PROVIDERS, getBuiltInProvider } from "built-in"` with `useRendererApp().pluginManager.contributions.providerTemplates`
- Inline the `getBuiltInProvider()` lookup as `templates.find(t => t.id === id)` where needed (e.g. `handleResetDefaults`)
- Template picker grid iterates the contributed array instead of the hardcoded constant

### 6. Register in app.tsx

Add `providersPlugin` to the `BUILTIN_PLUGINS` array in `renderer/src/core/app.tsx`.

## Files touched

| File                                                     | Change                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `shared/features/provider/built-in.ts`                   | Rename `BuiltInProvider` to `ProviderTemplate`, remove constant + `getBuiltInProvider()` |
| `shared/features/provider/templates.ts`                  | **New** - moved provider templates array                                                 |
| `renderer/src/core/plugin/contributions.ts`              | Add `providerTemplates` to `PluginContributions` + merge with dedup                      |
| `renderer/src/plugins/providers/index.ts`                | **New** - core providers plugin                                                          |
| `renderer/src/core/app.tsx`                              | Register `providersPlugin` in `BUILTIN_PLUGINS`                                          |
| `renderer/src/features/settings/.../providers-panel.tsx` | Use `useRendererApp()` for templates, inline `.find()` lookups                           |

## Deferred

- **Rename `Provider.builtInId` to `templateId`** — follows the `BuiltInProvider` to `ProviderTemplate` rename, but touches the persisted data model (type, contract, router, configStore, providers-panel). Broader migration, defer to a separate PR.

## Future extensions

- End-user JSON/YAML provider definitions in `~/.neovate-desktop/providers/`
- Provider-specific hooks (discoverModels, validateApiKey)
- Dynamic model fetching from provider APIs
