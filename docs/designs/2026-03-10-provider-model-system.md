# Provider & Model System Design

## Overview

Add a provider abstraction layer that allows users to configure third-party API providers (OpenRouter, Bedrock, custom endpoints, etc.) with credential injection into the Claude Agent SDK subprocess. Providers define their own model catalogs and alias mappings.

## 1. Data Structures

### Global: `~/.neovate-desktop/providers.json`

```json
{
  "providers": [
    {
      "id": "uuid",
      "name": "OpenRouter",
      "enabled": true,
      "baseURL": "https://openrouter.ai/api",
      "apiKey": "sk-or-...",
      "models": {
        "claude-sonnet-4": { "displayName": "Claude Sonnet 4" },
        "claude-haiku-4": { "displayName": "Claude Haiku 4" }
      },
      "modelMap": {
        "model": "claude-sonnet-4",
        "sonnet": "claude-sonnet-4",
        "haiku": "claude-haiku-4",
        "opus": "claude-sonnet-4"
      },
      "envOverrides": {}
    }
  ],
  "provider": "uuid",
  "model": "claude-sonnet-4"
}
```

**Provider fields:**

| Field          | Type                                       | Description                                                                                            |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `id`           | string (UUID)                              | Unique identifier                                                                                      |
| `name`         | string                                     | Display name                                                                                           |
| `enabled`      | boolean                                    | Whether the provider is available for selection                                                        |
| `baseURL`      | string                                     | API base URL                                                                                           |
| `apiKey`       | string                                     | API key / auth token                                                                                   |
| `models`       | `Record<string, { displayName?: string }>` | Available model catalog (keys are model identifiers, value may include a human-readable `displayName`) |
| `modelMap`     | object                                     | Maps SDK model slots to provider model names                                                           |
| `envOverrides` | `Record<string, string>`                   | Additional env vars to set/override                                                                    |

**`modelMap` keys:**

| Key      | Env Var                          | Description         |
| -------- | -------------------------------- | ------------------- |
| `model`  | `ANTHROPIC_MODEL`                | Default model       |
| `haiku`  | `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | Haiku slot mapping  |
| `opus`   | `ANTHROPIC_DEFAULT_OPUS_MODEL`   | Opus slot mapping   |
| `sonnet` | `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet slot mapping |

### Project: `~/.neovate-desktop/projects/<encoded-path>.json`

Path encoding: `/Users/chen/myproject` -> `Users-chen-myproject.json` (matches Claude SDK convention under `~/.claude/projects/`).

```json
{
  "provider": "uuid",
  "model": "claude-sonnet-4"
}
```

### Session: `~/.neovate-desktop/sessions/<sessionId>.json`

Extends current session config:

```json
{
  "model": "claude-sonnet-4",
  "provider": "uuid"
}
```

## 2. Resolution Priority

### Provider Resolution

```
session.provider -> project.provider -> global.provider -> (none)
```

- If a resolved provider ID points to a nonexistent provider (deleted), silently skip and fall through to the next scope.
- If a resolved provider has `enabled: false`, treat it the same as "not found" — skip and fall through.
- When resolved provider is `none`, SDK defaults are used (env vars from shell, all `settingSources`).

### Model Resolution

**With provider active:**

```
session.model -> project.model -> global.model -> provider.modelMap.model
```

`model` at project/global level is only used when a provider is configured. After resolution, if the resolved model does not exist in the active provider's `models` map, fall back to `provider.modelMap.model`.

**Without provider (current behavior preserved):**

```
session model -> <cwd>/.claude/settings.local.json -> ~/.claude/settings.json
```

Model list comes from SDK capabilities (`initializationResult()`).

## 3. SDK Environment Injection

### With Provider Active

In `session-manager.ts` `initSession()`, before spawning the SDK subprocess:

```ts
// Credentials
env.ANTHROPIC_AUTH_TOKEN = provider.apiKey;
env.ANTHROPIC_BASE_URL = provider.baseURL;
delete env.ANTHROPIC_API_KEY; // avoid conflicts with AUTH_TOKEN

// Model mapping — unset slots fall back to the default model so the SDK
// never tries to reach a model that doesn't exist on the provider endpoint.
const fallback = modelMap.model ?? Object.keys(provider.models)[0];
env.ANTHROPIC_MODEL = modelMap.model ?? fallback;
env.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelMap.haiku ?? fallback;
env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelMap.opus ?? fallback;
env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelMap.sonnet ?? fallback;

// User-defined overrides (empty string = delete the var)
const ENV_BLOCKLIST = new Set([
  "ELECTRON_RUN_AS_NODE",
  "NODE_OPTIONS",
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "LD_PRELOAD",
  "DYLD_INSERT_LIBRARIES",
]);
for (const [key, value] of Object.entries(provider.envOverrides)) {
  if (ENV_BLOCKLIST.has(key)) continue;
  if (value === "") delete env[key];
  else env[key] = value;
}

// Skip 'user' settings source to avoid ~/.claude/settings.json conflicts
settingSources = ["local", "project"];
```

### Mid-Session Provider Switch

Provider changes are **blocked during an active session**. Env vars (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, etc.) are baked into the SDK subprocess at spawn time and cannot be changed at runtime. Switching providers requires starting a new session. The UI should disable provider switching while a session is active and show an appropriate hint.

### Without Provider

Current behavior unchanged:

```ts
settingSources = ["local", "project", "user"];
// env from process.env + shellEnv (no injection)
```

## 4. File Layout

### New Files

```
shared/features/provider/types.ts          -- Provider, ProviderConfig, ProviderScope types
shared/features/provider/contract.ts       -- oRPC contract for provider CRUD + selection

main/features/provider/provider-store.ts   -- Read/write providers.json, project configs
main/features/provider/router.ts           -- oRPC router implementation
```

### Modified Files

```
main/features/agent/claude-settings.ts     -- Extend to read/write provider selection at all scopes
main/features/agent/session-manager.ts     -- Inject provider env into SDK subprocess
shared/features/agent/types.ts             -- Add ProviderScope, extend ModelScope
shared/features/agent/contract.ts          -- Add provider-related fields to createSession/loadSession

renderer/features/agent/components/input-toolbar.tsx  -- Combined provider/model dropdown (disable provider switch mid-session)
renderer/features/agent/store.ts           -- Add provider state to agent store
```

## 5. UI: Combined Provider/Model Selector

Single button in `InputToolbar` showing `ProviderName / ModelName`. Click opens a grouped menu:

```
+-------------------------------+
| * OpenRouter                  |   <- provider group header (radio)
|     claude-sonnet-4 (default, opus, sonnet)
|     claude-haiku-4 (haiku)    |   <- model with alias badges
| ------------------------------|
| o My Bedrock                  |
|     us.claude-sonnet...       |
| ------------------------------|
| o SDK Default                 |   <- "no provider" option
|     (models from SDK)         |
| ------------------------------|
| [gear] Manage Providers...    |   <- opens settings
+-------------------------------+
```

**Alias badges:** Each model shows which `modelMap` slots point to it, e.g. `claude-sonnet-4 (default, opus, sonnet)`.

**Context menu** (right-click on the selector):

- "Set as project default" — writes provider+model to project config
- "Set as global default" — writes provider+model to global config
- "Clear session override" — removes session-level provider+model

**Scope badge:** Same `ScopeBadge` pattern as current — shows globe (global), folder (project), or nothing (session) next to the button.

## 6. Provider Validation

On save, validate:

- `name` — non-empty, unique across providers
- `baseURL` — valid URL
- `apiKey` — non-empty
- `models` — at least one entry
- `modelMap` values — must reference keys in `models`

## 7. Key Design Decisions

1. **Provider models replace SDK models** — when a provider is active, the model selector shows only models from the provider's `models` map, ignoring SDK capabilities.

2. **`modelMap` translates to env vars** — the SDK subprocess receives `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, etc. so the SDK's internal model routing works transparently. Unset slots fall back to the default model to prevent the SDK from reaching models that don't exist on the provider endpoint.

3. **`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`** — default credential injection strategy. `envOverrides` handles edge cases (with a blocklist for dangerous system vars).

4. **Skip `'user'` settings source with provider** — prevents `~/.claude/settings.json` from overriding provider-injected env vars.

5. **`model` requires provider** — at project/global level, `model` is meaningless without a provider. Without a provider, model resolution falls through to SDK's own settings chain.

6. **Project path encoding** — matches Claude SDK convention: `/Users/chen/myproject` -> `Users-chen-myproject.json`.

7. **No mid-session provider switch** — provider/credential changes require a new session. Model-only switches within the same provider are allowed via the existing `set_model` dispatch.

8. **Graceful fallback on invalid state** — dangling provider refs (deleted/disabled) silently fall through. Model not in provider catalog falls back to `modelMap.model`.

## 8. TODO

- [ ] **Provider connection test** — add a contract method to validate credentials/endpoint before first use.
- [ ] **Provider `type` field** — support non-Anthropic auth strategies (Bedrock, Vertex, OpenAI-compatible). Currently only the Anthropic pattern (`AUTH_TOKEN` + `BASE_URL`) is supported.
- [ ] **Import/export providers** — share provider configs across machines (exclude API key by default).
