# Built-in Provider Templates

## Overview

Add built-in provider templates so users can quickly configure known providers (starting with OpenRouter) without manually entering baseURL, models, and modelMap. Users just need to provide their API key.

## UX Flow

1. User clicks "Add Provider"
2. **Template picker step** appears showing available templates + "Custom" option
3. Selecting a template pre-fills the form (name, baseURL, models, modelMap)
4. Selecting "Custom" opens the current blank form
5. User enters API key, optionally tweaks pre-filled values, clicks Create
6. Normal `addProvider()` flow — no backend changes

### Duplicate Prevention

Each built-in provider can only be added once. Detection uses a `builtInId` field stored on the `Provider` type (see Architecture). Templates whose `builtInId` already exists in the current `providers` array are filtered out of the picker. This is robust against user renames — even if the user changes the provider name from "OpenRouter" to "My Router", the `builtInId` still tracks the origin.

If all built-in templates are already added, skip the picker entirely and go straight to the blank form (no point showing a picker with only "Custom").

## Built-in Templates

### OpenRouter

| Field     | Value                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------- |
| id        | `openrouter`                                                                                          |
| name      | `providers.openrouter.name` (i18n key, default: `OpenRouter`)                                         |
| baseURL   | `https://openrouter.ai/api`                                                                           |
| apiKey    | _(empty — user must provide)_                                                                         |
| apiKeyURL | `https://openrouter.ai/keys`                                                                          |
| models    | `claude-sonnet-4` (Claude Sonnet 4), `claude-haiku-4` (Claude Haiku 4)                                |
| modelMap  | model: `claude-sonnet-4`, sonnet: `claude-sonnet-4`, haiku: `claude-haiku-4`, opus: `claude-sonnet-4` |

## Reset to Template Defaults

When editing a provider that has a `builtInId`, the form shows a **"Reset to defaults"** button. Clicking it re-applies the template's `baseURL`, `models`, `modelMap`, and `envOverrides` — but preserves the user's `apiKey`, `name`, and `enabled` state. This handles model list staleness when we ship updated templates in new app versions (e.g., new Claude model added to OpenRouter).

The button is only shown when the provider's current config differs from the template. Uses `getBuiltInProvider(builtInId)` to look up the original template.

**Confirmation:** Clicking "Reset to defaults" shows a confirmation dialog before applying, since it's destructive — any user-added models or customizations to baseURL/modelMap/envOverrides will be lost.

### Name Collision Handling

When creating from a built-in template, the pre-filled name (e.g., "OpenRouter") may collide with an existing custom provider's name. Since the backend enforces unique names, the form validation will catch this. The user can simply rename in the form before saving. No special auto-suffixing logic needed — keep it simple.

## Architecture

### New Files

```
shared/features/provider/built-in.ts
```

Exports a `BUILT_IN_PROVIDERS` array. Each entry contains all provider fields except `apiKey` and `enabled` (those are set during creation):

```ts
export type BuiltInProvider = {
  id: string; // Stable identifier, stored as `builtInId` on Provider
  nameKey: string; // i18n key for display name (e.g., "providers.openrouter.name")
  name: string; // Fallback display name when i18n key is missing
  baseURL: string;
  apiKeyURL?: string; // Clickable URL that opens browser to the API key page
  models: Record<string, { displayName?: string }>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
};

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  {
    id: "openrouter",
    nameKey: "providers.openrouter.name",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api",
    apiKeyURL: "https://openrouter.ai/keys",
    models: {
      "claude-sonnet-4": { displayName: "Claude Sonnet 4" },
      "claude-haiku-4": { displayName: "Claude Haiku 4" },
    },
    modelMap: {
      model: "claude-sonnet-4",
      sonnet: "claude-sonnet-4",
      haiku: "claude-haiku-4",
      opus: "claude-sonnet-4",
    },
    envOverrides: {},
  },
];

/** Look up a built-in template by its id */
export function getBuiltInProvider(builtInId: string): BuiltInProvider | undefined {
  return BUILT_IN_PROVIDERS.find((t) => t.id === builtInId);
}
```

### Modified Files

```
shared/features/provider/types.ts
```

- Add optional `builtInId?: string` to the `Provider` type. Set when a provider is created from a built-in template, left `undefined` for custom providers.

```
renderer/features/settings/components/panels/providers-panel.tsx
```

- Add `selectedTemplate` state (`BuiltInProvider | "custom" | null`)
- When `isCreating && selectedTemplate === null` → show template picker
- When template selected → pre-fill form via `setForm()`, set `selectedTemplate`
- Filter out already-added templates by matching `builtInId` against existing `providers`
- If no available templates remain, skip picker and go straight to blank form
- When a template with `apiKeyURL` is active (creating or editing a built-in provider), show a clickable link below the API key input that opens the URL in the browser via `shell.openExternal()`
- When editing a provider with `builtInId`, show a "Reset to defaults" button that re-applies template values (baseURL, models, modelMap, envOverrides) while keeping apiKey, name, and enabled
- Use i18n keys (`nameKey`) for template display names in the picker, with `name` as fallback

### Backend Changes

```
shared/features/provider/contract.ts
```

- Accept optional `builtInId` in the `create` input schema, pass through to stored provider.

```
main/features/config/config-store.ts
```

- `builtInId` is persisted as part of the `Provider` object (no special handling needed — it's just a new optional field on the type).
