# Scope-aware Plugin Install Prevention

**Date:** 2026-04-01
**Branch:** feat/plugin-management
**Status:** Approved, not yet implemented

## Problem

The plugin install flow has no scope-aware duplicate prevention:

1. **Discover tab**: `MarketplacePlugin.installed` is a flat boolean. If installed in ANY scope, the entire install button is hidden — no way to install in a different scope from the card.
2. **Detail modal**: Always shows the install form regardless of whether the plugin is already installed in the selected scope+project. Users can reinstall the same scope repeatedly — it silently re-clones and overwrites.
3. **Backend `install()`**: No guard. It `rm -rf`s the destination, re-clones, and updates the JSON every time.

## Approach

**Enrich `MarketplacePlugin` with installed scope data.** The UI uses this to proactively prevent duplicate installs. Backend remains unchanged (idempotent overwrite is kept as a fallback for repair scenarios).

## Design

### 1. Data Model Change

**`types.ts`** — replace `installed: boolean` with `installedScopes`:

```ts
export interface MarketplacePlugin {
  // ...existing fields...
  // REMOVED: installed: boolean
  installedScopes: Array<{
    scope: "user" | "project" | "local";
    projectPath?: string;
  }>;
}
```

The old `installed` boolean is dropped — derive it as `installedScopes.length > 0` in the renderer where needed. This is an internal oRPC contract with no third-party consumers, so there's no backward compat concern.

### 2. Backend Change

**`plugins-service.ts` → `loadMarketplacePlugins()`** — populate `installedScopes`:

```ts
const entries = installed.plugins[pluginId] ?? [];
return {
  ...existingFields,
  installedScopes: entries.map((e) => ({
    scope: e.scope,
    projectPath: e.projectPath,
  })),
};
```

**`contract.ts`** — update the zod schema for the marketplace plugin response to include the `installedScopes` array and remove the `installed` boolean.

### 3. Detail Modal — Scope-aware Install Button

**`plugin-detail-modal.tsx`**

When the user selects a scope+project in the dropdowns:

- Compute `isAlreadyInstalled` by checking `marketplacePlugin.installedScopes` for a matching `scope + projectPath`
- If match found: button disabled, shows "Installed" with check icon (muted/outline style)
- If no match: button enabled, shows "Install" (primary style)

**Show where it's already installed** — display a small line above or near the install controls:

```
Already installed: User (global), my-project (shared)
```

This gives the user context for why the button is disabled and guides them to pick a different scope.

```
Selected: "User (global)"       ->  [check] Installed (disabled)
                                     Already installed: User (global)
Selected: "my-project / Shared"  ->  Install (enabled, primary)
```

### 4. Discover Tab Cards — Simple Badge Logic

**`discover-tab.tsx`**

Keep cards simple — use the detail modal for scope decisions:

| State                  | Badge             | Button                    |
| ---------------------- | ----------------- | ------------------------- |
| Not installed anywhere | (none)            | Download button (enabled) |
| Installed in any scope | "Installed" badge | Hidden                    |

The user clicks the card to open the detail modal where they can see which scopes are installed and install into a different one. This avoids the confusing UX of showing both a badge and a download button on a small card.

Check: `installedScopes.length > 0` determines whether to show badge vs button.

### 5. Files to Change

| File                                                                               | Change                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/shared/features/claude-code-plugins/types.ts`                                 | Replace `installed: boolean` with `installedScopes` array                  |
| `src/shared/features/claude-code-plugins/contract.ts`                              | Update zod schema for marketplace plugin response                          |
| `src/main/features/claude-code-plugins/plugins-service.ts`                         | Populate `installedScopes` in `loadMarketplacePlugins()`                   |
| `src/renderer/src/features/claude-code-plugins/components/plugin-detail-modal.tsx` | Compute `isAlreadyInstalled`, show installed scope context, disable button |
| `src/renderer/src/features/claude-code-plugins/components/discover-tab.tsx`        | Replace `plugin.installed` with `plugin.installedScopes.length > 0`        |

### 6. What We're NOT Doing

- No backend guard (install remains idempotent overwrite — useful for repair)
- No new API endpoints
- No "Reinstall" action (may add later if needed)
