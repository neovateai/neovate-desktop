# Auxiliary Model: SDK Default Auto-Fallback

**Date:** 2026-04-03
**Status:** Approved

## Problem

The auxiliary LLM service (`LlmService`) currently only supports custom providers with explicit API credentials. SDK Default is entirely excluded because it has no directly accessible API key for `@anthropic-ai/sdk` calls.

However, there are two distinct SDK Default cases:

1. **Without `ANTHROPIC_BASE_URL`**: SDK subprocess uses Anthropic's official API with internal auth (OAuth). No credentials available for direct `@anthropic-ai/sdk` calls in the main process. Auxiliary LLM is **not possible**.
2. **With `ANTHROPIC_BASE_URL`**: User has configured a proxy/custom endpoint. `ANTHROPIC_API_KEY` is also typically available. The main process **can** construct an `Anthropic` client using these credentials.

When no auxiliary model is explicitly selected, the service should piggyback on the primary AI model configuration -- including SDK Default when `ANTHROPIC_BASE_URL` is present.

## Decision

**Approach B: Auto-fallback to primary model config.**

When `auxiliaryModelSelection` is empty (no explicit selection), `LlmService` falls back to the primary AI model configuration:

- If the primary model uses a **custom provider** -> reuse that provider's credentials and model.
- If the primary model uses **SDK Default with `ANTHROPIC_BASE_URL`** -> resolve credentials from shell env + `~/.claude/settings.json` and use them.
- If the primary model uses **SDK Default without `ANTHROPIC_BASE_URL`** -> auxiliary LLM is not available.

Additionally, rename `isConfigured()` -> `isAvailable()` across all layers to reflect the new semantics: "can plugins use the query feature?" **`isAvailable()` becomes async** (`Promise<boolean>`), since resolving SDK Default credentials requires reading shell env via `shellEnvService.getEnv()`.

## Fallback Chain

### `resolveForCall()` logic

```
1. If auxiliaryModelSelection is set -> use selected custom provider (unchanged)
2. If auxiliaryModelSelection is empty -> read primary model config:
   a. getGlobalSelection() returns { provider, model }
      - If provider exists -> use that provider's credentials + model
      - If no model in global selection -> throw meaningful error
   b. No provider (SDK Default) -> resolveSDKDefaultCredentials()
      - If ANTHROPIC_BASE_URL found -> use credentials + primary model from settings.json
      - If primary model is also empty -> throw meaningful error
      - If no ANTHROPIC_BASE_URL -> throw "Auxiliary LLM not available"
```

### `isAvailable()` logic

| Primary model config               | Explicit aux selection  | `isAvailable()` |
| ---------------------------------- | ----------------------- | --------------- |
| Any                                | Custom provider (valid) | `true`          |
| Custom provider                    | Empty                   | `true`          |
| SDK Default + `ANTHROPIC_BASE_URL` | Empty                   | `true`          |
| SDK Default (no base URL)          | Empty                   | `false`         |

### Model resolution (when falling back to primary)

- Plugin-specified `opts.model` override takes precedence (if provided)
- Otherwise: use the primary AI model (from `getGlobalModelSelection()` -- configStore global selection or `~/.claude/settings.json` model field)
- If primary model is also empty: throw a meaningful error guiding the user to configure a model

## Error Messages

Specific, actionable errors depending on which fallback path failed:

| Condition                                                     | Error message                                                                                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No aux selection, no global provider, no `ANTHROPIC_BASE_URL` | "Auxiliary LLM not available. Primary model uses SDK Default without ANTHROPIC_BASE_URL. Configure a custom provider in Settings > Providers, or set ANTHROPIC_BASE_URL in your environment." |
| No aux selection, global provider disabled/missing            | "Auxiliary LLM provider \"{name}\" is not available or disabled."                                                                                                                             |
| No aux selection, SDK Default fallback, no model configured   | "Auxiliary LLM has credentials but no model configured. Set a model in Settings > Chat > Model or in ~/.claude/settings.json."                                                                |
| Explicit aux selection, provider disabled/missing             | "Auxiliary LLM provider \"{id}\" is not available or disabled." (unchanged)                                                                                                                   |

## SDK Default Credential Resolution

New private async method in `LlmService`:

```ts
async resolveSDKDefaultCredentials(): Promise<{ baseURL: string; apiKey: string } | null>
```

Sources (settings.json env takes priority over shell env, matching SDK behavior):

1. Read `~/.claude/settings.json` -> `env.ANTHROPIC_BASE_URL`, `env.ANTHROPIC_API_KEY`
2. Read shell env via `shellEnvService.getEnv()` -> `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`
3. Merge: settings.json values override shell env values
4. Return credentials only if `baseURL` is present
5. Cache result, invalidate when relevant config changes

**Important:** Only resolve `ANTHROPIC_API_KEY` -- not `ANTHROPIC_AUTH_TOKEN`. The `@anthropic-ai/sdk` `Anthropic` client constructor expects `apiKey` (maps to `x-api-key` header). `ANTHROPIC_AUTH_TOKEN` is a Claude Code SDK-specific env var used by the subprocess and is not compatible with direct `@anthropic-ai/sdk` calls.

Requires `IShellService` to be injected into `LlmService` constructor.

## Rename: `isConfigured()` -> `isAvailable()`

Rename across all layers:

- `ILlmService` interface (`src/shared/features/llm/types.ts`)
- `LlmService` implementation (`src/main/features/llm/llm-service.ts`)
- oRPC contract (`src/shared/features/llm/contract.ts`)
- oRPC router (`src/main/features/llm/router.ts`)
- Renderer wrapper (`src/renderer/src/core/app.tsx`)
- Stub in `MainApp` constructor (`src/main/app.ts`)
- Debug view (`src/renderer/src/plugins/debug/debug-view.tsx`)
- Test stubs (`src/main/core/plugin/__tests__/plugin-manager.test.ts`, `src/renderer/src/core/__tests__/plugin-manager.test.ts`)

**Signature change:** `isConfigured(): boolean` -> `isAvailable(): Promise<boolean>`.

New semantics: returns `true` when auxiliary LLM queries will succeed -- either via explicit selection or via auto-fallback to primary model credentials.

## Cache Invalidation

The current implementation only invalidates the cached `Anthropic` client when `auxiliaryModelSelection` changes (via `configStore.onChange`). With the auto-fallback, the effective credentials now also depend on:

- Global provider/model selection (user switches primary model in GlobalModelSelect)
- Provider updates (user edits API key or base URL of the fallback provider)

### ConfigStore API gap

`ConfigStore.onChange()` is typed to `keyof AppConfig`, but the keys that need watching (`provider`, `model`, `providers`) are in `ConfigStoreSchema` only -- not in `AppConfig`. They cannot be subscribed to through the current typed API.

**Solution:** Add `onAnyChange(cb)` to `ConfigStore`, wrapping `electron-store`'s `onDidAnyChange()`. `LlmService` subscribes via `onAnyChange` and internally diffs only the relevant keys before invalidating:

```ts
// ConfigStore
onAnyChange(cb: (newValue: ConfigStoreSchema, oldValue: ConfigStoreSchema) => void): () => void {
  return this.store.onDidAnyChange((newVal, oldVal) => {
    cb(newVal as ConfigStoreSchema, oldVal as ConfigStoreSchema);
  });
}
```

```ts
// LlmService — subscribe and filter
this.configStore.onAnyChange((newVal, oldVal) => {
  const relevant =
    newVal.auxiliaryModelSelection !== oldVal.auxiliaryModelSelection ||
    newVal.provider !== oldVal.provider ||
    newVal.model !== oldVal.model ||
    newVal.providers !== oldVal.providers;
  if (relevant) {
    this.cachedClient = null;
    this.cachedProviderId = null;
  }
});
```

This replaces the existing `configStore.onChange("auxiliaryModelSelection", ...)` subscription.

File watching for `~/.claude/settings.json` is not needed for v1 -- changes to settings.json require restarting Claude Code sessions anyway.

## Renderer Subscription Scope

The renderer wrapper in `app.tsx` currently only re-fetches `isAvailable` when `auxiliaryModelSelection` changes:

```ts
useConfigStore.subscribe((state, prev) => {
  if (state.auxiliaryModelSelection !== prev.auxiliaryModelSelection) refresh();
});
```

With auto-fallback, availability also depends on the primary model/provider selection. **Broaden the subscription** to also trigger refresh when any config change occurs that could affect availability (or simplify to refresh on any config change -- the oRPC call is cheap and config changes are infrequent).

## UI: AuxiliaryModelSelect

Dropdown behavior is **unchanged** -- still shows "Not configured" when empty, custom provider list when selecting.

The **description text** for the Auxiliary Model setting row is updated to explain the auto-fallback behavior: when not explicitly configured, it will automatically use the primary AI model if credentials are available.

## Known Limitations

- **Project-level provider is not considered in fallback.** The fallback reads `getGlobalSelection()` only, not project-scoped overrides. `LlmService` has no project/CWD context, so global-only is a reasonable v1 simplification. Could be extended later if plugins pass project context.

## File Changes

| File                                                                  | Change                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/features/llm/types.ts`                                    | Rename `isConfigured()` -> `isAvailable()`, change return to `Promise<boolean>`                                                                                                 |
| `src/shared/features/llm/contract.ts`                                 | Rename oRPC method `isConfigured` -> `isAvailable`                                                                                                                              |
| `src/main/features/config/config-store.ts`                            | Add `onAnyChange(cb)` method                                                                                                                                                    |
| `src/main/features/llm/llm-service.ts`                                | Add fallback to primary model, SDK Default credential resolution, inject `IShellService`, rename method, use `onAnyChange` with relevant-key filtering, specific error messages |
| `src/main/features/llm/router.ts`                                     | Update method name                                                                                                                                                              |
| `src/main/index.ts`                                                   | Pass `shellEnvService` to `LlmService` constructor                                                                                                                              |
| `src/main/app.ts`                                                     | Update stub: `isConfigured` -> `isAvailable` (async)                                                                                                                            |
| `src/renderer/src/core/app.tsx`                                       | Update wrapper: `isConfigured` -> `isAvailable` (async), broaden config subscription                                                                                            |
| `src/renderer/src/plugins/debug/debug-view.tsx`                       | Update `handleIsConfigured` to await async `isAvailable()`                                                                                                                      |
| `src/renderer/src/features/settings/components/panels/chat-panel.tsx` | Update description text for auxiliary model row                                                                                                                                 |
| `src/main/core/plugin/__tests__/plugin-manager.test.ts`               | Update test stub                                                                                                                                                                |
| `src/renderer/src/core/__tests__/plugin-manager.test.ts`              | Update test stub                                                                                                                                                                |
| i18n files (`en-US.json`, `zh-CN.json`)                               | Update `settings.chat.auxiliaryModel.description`                                                                                                                               |
