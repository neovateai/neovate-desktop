# Auxiliary LLM Query for Plugin Context

**Date:** 2026-04-02
**Status:** Approved

## Problem

Plugins (both main and renderer) need to make LLM calls for tasks outside the main agent conversation — summarization, code analysis, commit message generation, etc. Currently `PluginContext` provides no LLM capability. The SDK Default provider works through the Claude Code SDK subprocess and does not expose API credentials usable by `@anthropic-ai/sdk` directly, so only custom providers can be used for auxiliary LLM calls.

## Decision

**Approach C: Main-side LlmService + oRPC contract.**

- Create `LlmService` in main process that manages the `@anthropic-ai/sdk` Anthropic client.
- Expose via oRPC contract so both main plugins and renderer plugins use the same path.
- Main `PluginContext.llm` calls the service directly (no IPC overhead).
- Renderer plugins call via `client.llm.query()` / `client.llm.queryMessages()`.
- Single credential management, no SDK in renderer bundle, follows existing architecture patterns.
- **SDK Default is not supported** — only custom providers with explicit `apiKey`/`baseURL` can be used.

## API Surface

All methods support `AbortSignal` for cancellation:

### `isConfigured()` — Availability check

```ts
isConfigured(): boolean
```

Sync check so plugins can guard UI or skip features gracefully without try/catch.
Main: checks `configStore` for selection + enabled provider (sync).
Renderer: prefetches via `client.llm.isConfigured()` during plugin context construction and caches the result. Subscribes to config changes to stay current. Exposed as sync `boolean` to match the shared interface.

### `query(prompt, opts?)` — Simple text-in/text-out

```ts
async query(prompt: string, opts?: {
  model?: string;
  maxTokens?: number;   // default: 4096
  system?: string;
  temperature?: number; // default: 0 (deterministic)
  signal?: AbortSignal;
}): Promise<string>
```

### `queryMessages(messages, opts?)` — Messages API mirror

```ts
async queryMessages(
  messages: Array<{ role: string; content: string }>,
  opts?: {
    model?: string;
    maxTokens?: number;   // default: 4096
    system?: string;
    temperature?: number; // default: 0 (deterministic)
    signal?: AbortSignal;
  }
): Promise<{
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}>
```

### Defaults

- `maxTokens`: `4096` — reasonable for most auxiliary tasks without burning tokens.
- `temperature`: `0` — deterministic by default for predictable auxiliary results. Plugins wanting creativity can override.

## Config & Settings

### New config field in `AppConfig`

```ts
auxiliaryModelSelection: string; // "" = not configured, "provider-id:model-id" encoded
```

Default: `""` (empty = not configured, uses fallback logic).

Uses the same `provider:model` encoding pattern as `GlobalModelSelect` (`encodeValue` / `decodeValue`).

### Settings UI

In `chat-panel.tsx`, below the existing "Model" row in the Model group, add an "Auxiliary Model" dropdown. Uses the same `Menu`/`MenuRadioGroup` pattern as `GlobalModelSelect` but:

- **Only shows custom providers** — SDK Default is filtered out entirely (it cannot be used with `@anthropic-ai/sdk`)
- Groups models by provider name
- Default is "Not configured" (empty value) — user must explicitly select a provider + model
- No automatic fallback — explicit selection required

Writes to `auxiliaryModelSelection` config key.

## LlmService (Main Process)

**File:** `src/main/features/llm/llm-service.ts`

**Interface:** `src/shared/features/llm/types.ts` — `ILlmService` interface shared between processes.

### Client caching

The service caches the `Anthropic` client instance. Invalidated when `auxiliaryModelSelection` changes or the underlying provider's credentials are updated. `ConfigStore` change events trigger cache reset.

### Internal logic

1. `isConfigured()`: decode `auxiliaryModelSelection`, check provider exists and is enabled. Sync, no I/O.
2. Decode `auxiliaryModelSelection` from `configStore` into `providerId` + `model`
3. If explicit selection exists → look up that provider's `apiKey` + `baseURL`, use specified model
4. If no selection (empty) → throw a clear error: "No auxiliary model configured. Select one in Settings > Chat > Auxiliary Model."
5. Use cached `Anthropic` client (or create + cache) and call `client.messages.create()`
6. The `model` param in opts overrides the stored model (for plugin-specific needs)
7. Pass `signal` through to `client.messages.create()` for cancellation
8. Apply defaults: `max_tokens: 4096`, `temperature: 0` when not specified
9. No automatic fallback — explicit user selection required

**SDK Default is never used** — it has no accessible API key for direct `@anthropic-ai/sdk` calls.

## oRPC Contract

**File:** `src/shared/features/llm/contract.ts`

```ts
llm: {
  isConfigured: { input: {}, output: { configured: boolean } }
  query: { input: { prompt, model?, maxTokens?, system?, temperature? }, output: { content } }
  queryMessages: { input: { messages, model?, maxTokens?, system?, temperature? }, output: { content, model, usage, stopReason } }
}
```

Note: `signal` is provided by the oRPC framework automatically, not part of the input schema.

Note: `signal` is provided by the oRPC framework automatically, not part of the input schema.

## PluginContext Changes

### Main (`src/main/core/plugin/types.ts`)

```ts
export interface PluginContext {
  app: IMainApp;
  orpcServer: typeof os;
  shell: IShellService;
  llm: ILlmService; // new
}
```

### Renderer (`src/renderer/src/core/plugin/types.ts`)

```ts
export interface PluginContext {
  app: IRendererApp;
  orpcClient: Record<string, unknown>;
  llm: ILlmService; // new — thin wrapper around client.llm.*, same interface
}
```

Both processes use the same `ILlmService` interface from `src/shared/features/llm/types.ts`.

## File Changes

| File                                                                  | Change                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/shared/features/llm/types.ts`                                    | **New** — `ILlmService` interface (shared, includes `isConfigured()`) |
| `src/shared/features/llm/contract.ts`                                 | **New** — oRPC contract                                               |
| `src/shared/features/config/types.ts`                                 | Add `auxiliaryModelSelection` to `AppConfig`                          |
| `src/shared/contract.ts`                                              | Import & merge llm contract                                           |
| `src/main/features/llm/llm-service.ts`                                | **New** — `LlmService` class                                          |
| `src/main/features/llm/router.ts`                                     | **New** — oRPC router                                                 |
| `src/main/features/config/config-store.ts`                            | Add default for `auxiliaryModelSelection`                             |
| `src/main/core/plugin/types.ts`                                       | Add `llm: ILlmService` to `PluginContext`                             |
| `src/main/app.ts`                                                     | Construct LlmService, pass to plugin context                          |
| `src/main/router.ts`                                                  | Wire up llm router                                                    |
| `src/renderer/src/core/plugin/types.ts`                               | Add `llm: ILlmService` to `PluginContext`                             |
| `src/renderer/src/core/app.tsx`                                       | Build llm client wrapper, pass to plugin context                      |
| `src/renderer/src/features/settings/components/panels/chat-panel.tsx` | Add Auxiliary Model dropdown (custom providers only)                  |
| i18n files                                                            | Add translation keys                                                  |
