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

### 1. Anthropic

> Official Anthropic API — direct access to Claude models

| Field        | Value                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| id           | `anthropic`                                                                                                         |
| name         | `Anthropic`                                                                                                         |
| description  | en-US: `Official Anthropic API`, zh-CN: `Anthropic 官方 API`                                                        |
| baseURL      | `https://api.anthropic.com`                                                                                         |
| apiKeyURL    | `https://console.anthropic.com/settings/keys`                                                                       |
| docURL       | `https://docs.anthropic.com/en/docs/about-claude/models`                                                            |
| models       | `claude-opus-4-6` (Claude Opus 4.6), `claude-sonnet-4-6` (Claude Sonnet 4.6), `claude-haiku-4-5` (Claude Haiku 4.5) |
| modelMap     | model: `claude-opus-4-6`, sonnet: `claude-sonnet-4-6`, haiku: `claude-haiku-4-5`, opus: `claude-opus-4-6`           |
| envOverrides | _(none)_                                                                                                            |

### 2. OpenRouter

> Multi-model API aggregator with unified billing

| Field        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id           | `openrouter`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| name         | `OpenRouter`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| description  | en-US: `Multi-model API aggregator`, zh-CN: `多模型 API 聚合平台`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| baseURL      | `https://openrouter.ai/api`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| apiKeyURL    | `https://openrouter.ai/settings/keys`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| docURL       | `https://openrouter.ai/models`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| models       | `anthropic/claude-opus-4.6` (Claude Opus 4.6), `anthropic/claude-sonnet-4.6` (Claude Sonnet 4.6), `anthropic/claude-haiku-4.5` (Claude Haiku 4.5), `openai/gpt-5.2-pro` (GPT-5.2 Pro), `google/gemini-3-pro-preview` (Gemini 3 Pro), `google/gemini-3-flash-preview` (Gemini 3 Flash), `z-ai/glm-5` (GLM-5), `deepseek/deepseek-reasoner` (DeepSeek Reasoner), `deepseek/deepseek-chat` (DeepSeek Chat), `moonshotai/kimi-k2.5` (Kimi K2.5), `minimax/minimax-m2.5` (MiniMax-M2.5) |
| modelMap     | _(empty — default is first model in list)_                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| envOverrides | _(none)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 3. GLM (CN)

> Zhipu AI models, China endpoint

| Field        | Value                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| id           | `glm-cn`                                                                  |
| name         | `GLM (CN)` · nameLocalized: zh-CN: `智谱 GLM（国内）`                     |
| description  | en-US: `Zhipu AI models, China endpoint`, zh-CN: `智谱 AI 模型，国内端点` |
| baseURL      | `https://open.bigmodel.cn/api/anthropic`                                  |
| apiKeyURL    | `https://open.bigmodel.cn/usercenter/apikeys`                             |
| docURL       | `https://docs.bigmodel.cn/cn/coding-plan/overview`                        |
| models       | `glm-5` (GLM-5)                                                           |
| modelMap     | model: `glm-5`                                                            |
| envOverrides | _(none)_                                                                  |

### 4. GLM (Global)

> Zhipu AI models, global endpoint

| Field        | Value                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| id           | `glm-global`                                                               |
| name         | `GLM (Global)` · nameLocalized: zh-CN: `智谱 GLM（国际）`                  |
| description  | en-US: `Zhipu AI models, global endpoint`, zh-CN: `智谱 AI 模型，国际端点` |
| baseURL      | `https://api.z.ai/api/anthropic`                                           |
| docURL       | `https://docs.z.ai/devpack/overview`                                       |
| models       | `glm-5` (GLM-5)                                                            |
| modelMap     | model: `glm-5`                                                             |
| envOverrides | _(none)_                                                                   |

### 5. Kimi

> Moonshot's Kimi coding model

| Field        | Value                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| id           | `kimi`                                                                 |
| name         | `Kimi`                                                                 |
| description  | en-US: `Moonshot's Kimi coding model`, zh-CN: `月之暗面 Kimi 编程模型` |
| baseURL      | `https://api.kimi.com/coding/`                                         |
| docURL       | `https://www.kimi.com/coding/docs/en/third-party-agents.html`          |
| models       | `kimi-for-coding` (Kimi K2.5)                                          |
| modelMap     | model: `kimi-for-coding`                                               |
| envOverrides | _(none)_                                                               |

### 6. Moonshot

> Kimi K2.5 via Moonshot API (China)

| Field        | Value                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| id           | `moonshot`                                                                     |
| name         | `Moonshot`                                                                     |
| description  | en-US: `Kimi K2.5 via Moonshot API`, zh-CN: `通过 Moonshot API 使用 Kimi K2.5` |
| baseURL      | `https://api.moonshot.cn/anthropic`                                            |
| docURL       | `https://platform.moonshot.cn/docs/api/chat`                                   |
| models       | `sonnet` (Kimi K2.5)                                                           |
| modelMap     | model: `sonnet`                                                                |
| envOverrides | _(none)_                                                                       |

### 7. MiniMax (CN)

> MiniMax M2.5 model, China endpoint

| Field        | Value                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| id           | `minimax-cn`                                                                      |
| name         | `MiniMax (CN)` · nameLocalized: zh-CN: `MiniMax（国内）`                          |
| description  | en-US: `MiniMax M2.5 model, China endpoint`, zh-CN: `MiniMax M2.5 模型，国内端点` |
| baseURL      | `https://api.minimaxi.com/anthropic`                                              |
| docURL       | `https://platform.minimaxi.com/docs/coding-plan/intro`                            |
| models       | `minimax-m2.5` (MiniMax-M2.5)                                                     |
| modelMap     | model: `minimax-m2.5`                                                             |
| envOverrides | _(none)_                                                                          |

### 8. MiniMax (Global)

> MiniMax M2.5 model, global endpoint

| Field        | Value                                                                              |
| ------------ | ---------------------------------------------------------------------------------- |
| id           | `minimax-global`                                                                   |
| name         | `MiniMax (Global)` · nameLocalized: zh-CN: `MiniMax（国际）`                       |
| description  | en-US: `MiniMax M2.5 model, global endpoint`, zh-CN: `MiniMax M2.5 模型，国际端点` |
| baseURL      | `https://api.minimax.io/anthropic`                                                 |
| docURL       | `https://platform.minimax.io/docs/coding-plan/intro`                               |
| models       | `minimax-m2.5` (MiniMax-M2.5)                                                      |
| modelMap     | model: `minimax-m2.5`                                                              |
| envOverrides | _(none)_                                                                           |

### 9. Aliyun Bailian

> Alibaba Cloud multi-model aggregator (Qwen, Kimi, GLM, MiniMax)

| Field        | Value                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id           | `bailian`                                                                                                                                                                                                    |
| name         | `Aliyun Bailian` · nameLocalized: zh-CN: `阿里云百炼`                                                                                                                                                        |
| description  | en-US: `Alibaba Cloud multi-model aggregator`, zh-CN: `阿里云多模型聚合平台`                                                                                                                                 |
| baseURL      | `https://coding.dashscope.aliyuncs.com/apps/anthropic`                                                                                                                                                       |
| docURL       | `https://help.aliyun.com/zh/model-studio/coding-plan`                                                                                                                                                        |
| models       | `qwen3.5-plus` (Qwen 3.5 Plus), `qwen3-coder-next` (Qwen 3 Coder Next), `qwen3-coder-plus` (Qwen 3 Coder Plus), `kimi-k2.5` (Kimi K2.5), `glm-5` (GLM-5), `glm-4.7` (GLM-4.7), `MiniMax-M2.5` (MiniMax-M2.5) |
| modelMap     | model: `kimi-k2.5`                                                                                                                                                                                           |
| envOverrides | _(none)_                                                                                                                                                                                                     |

### 10. ZenMux

> Multi-model API aggregator

| Field        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id           | `zenmux`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| name         | `ZenMux`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| description  | en-US: `Multi-model API aggregator`, zh-CN: `多模型 API 聚合平台`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| baseURL      | `https://zenmux.ai/api/anthropic/v1`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| docURL       | `https://docs.zenmux.ai/`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| models       | `anthropic/claude-opus-4.6` (Claude Opus 4.6), `anthropic/claude-sonnet-4.6` (Claude Sonnet 4.6), `anthropic/claude-haiku-4.5` (Claude Haiku 4.5), `openai/gpt-5.2-pro` (GPT-5.2 Pro), `google/gemini-3-pro-preview` (Gemini 3 Pro), `google/gemini-3-flash-preview` (Gemini 3 Flash), `z-ai/glm-5` (GLM-5), `deepseek/deepseek-reasoner` (DeepSeek Reasoner), `deepseek/deepseek-chat` (DeepSeek Chat), `moonshotai/kimi-k2.5` (Kimi K2.5), `minimax/minimax-m2.5` (MiniMax-M2.5) |
| modelMap     | _(empty — default is first model in list)_                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| envOverrides | _(none)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### Design Decisions

- **Non-Claude providers**: Only `modelMap.model` is set. The `haiku`/`opus`/`sonnet` slots are left empty because these providers don't have natural equivalents to the Claude model tiers.
- **Model IDs**: Each provider uses the actual model ID its API accepts (e.g., `glm-5`, `kimi-for-coding`, `minimax-m2.5`). Moonshot is the exception — its Anthropic-compatible proxy accepts Claude aliases, so `sonnet` is used.
- **Multi-model aggregators**: OpenRouter, ZenMux, and Bailian list top models from multiple vendors. `modelMap` is empty — the default model is determined by the first entry in the `models` record.
- **Single model per provider**: Most non-Claude providers offer one primary model for coding.
- **CN/Global split**: GLM and MiniMax are kept as separate built-in entries (different base URLs, same models) rather than merged with a region toggle, to keep the UX simple.
- **envOverrides**: All new providers use empty `envOverrides`. Auth is handled by the framework (`apiKey` → `ANTHROPIC_AUTH_TOKEN` in session-manager.ts).
- **Descriptions**: Each provider has a brief one-line description shown in the template picker to help users distinguish similar providers (e.g., CN vs Global variants).
- **Inline i18n**: Translations are embedded in the provider config (`L10nText` maps) rather than in locale files. This makes provider definitions self-contained — critical for future plugin-based provider extensions where plugins shouldn't need to inject into locale files. `name` is a plain string (brand name / en-US fallback); `nameLocalized` is optional for the few providers needing locale-specific names; `description` is always a `L10nText` map.

## Reset to Template Defaults

When editing a provider that has a `builtInId`, the form shows a **"Reset to defaults"** button. Clicking it re-applies the template's `baseURL`, `models`, `modelMap`, and `envOverrides` — but preserves the user's `apiKey`, `name`, and `enabled` state. This handles model list staleness when we ship updated templates in new app versions (e.g., new Claude model added to OpenRouter).

The button is only shown when the provider's current config differs from the template. Uses `getBuiltInProvider(builtInId)` to look up the original template.

**Confirmation:** Clicking "Reset to defaults" shows a confirmation dialog before applying, since it's destructive — any user-added models or customizations to baseURL/modelMap/envOverrides will be lost.

### Update Indicator (future improvement)

When we ship updated model lists in a new app version, existing users with a `builtInId` provider won't see the changes until they manually click "Reset to defaults." To improve discoverability, show a subtle dot/badge on the provider card or "Reset to defaults" button when the built-in template has changed since the provider was last synced. Comparison can use a shallow diff of `baseURL + models + modelMap + envOverrides` against the current template.

### Name Collision Handling

When creating from a built-in template, the pre-filled name (e.g., "OpenRouter") may collide with an existing custom provider's name. Since the backend enforces unique names, the form validation will catch this. The user can simply rename in the form before saving. No special auto-suffixing logic needed — keep it simple.

## Implementation Changes

### `shared/features/provider/built-in.ts`

Provider type with inline i18n — translations live in the provider config itself (no locale file entries needed), so plugins can ship self-contained provider definitions:

```ts
export type L10nText = Record<string, string>;

export type BuiltInProvider = {
  id: string;
  name: string; // brand name (en-US fallback, also used as form default)
  nameLocalized?: L10nText; // only for providers with locale-specific names
  description: L10nText; // always localized, keyed by locale
  baseURL: string;
  apiKeyURL?: string;
  docURL?: string;
  models: Record<string, { displayName?: string }>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
};
```

A `resolveL10n(value, lang, localized?)` helper resolves the display string for the current locale with en-US fallback.

Update `BUILT_IN_PROVIDERS` array: add 8 new entries (Anthropic, GLM CN, GLM Global, Kimi, Moonshot, MiniMax CN, MiniMax Global, Bailian) and update the existing OpenRouter entry with current model IDs.

### `renderer/src/features/settings/components/panels/providers-panel.tsx`

- Template picker cards: use `resolveL10n()` to display localized name and description, and abbreviated baseURL (hostname only) below that — so users see all three: name, description, and endpoint at a glance.
- Template picker grid: bump from `grid-cols-2` to `grid-cols-3` to reduce vertical scrolling (10 cards = 4 rows instead of 5).
- `builtInToForm()` resolves the localized name for the current locale as the form default.
- Edit form: show `docURL` as a "View docs" link next to the existing apiKeyURL "Get your API key" link.
- TODO: Add "Test Connection" button to verify API key works (separate PR).

### `renderer/src/locales/*.json`

No provider-specific i18n keys needed — all provider name/description translations are inline in `built-in.ts`. This makes provider configs self-contained, which is required for future plugin-based provider extensions.

### No other backend changes needed

The existing architecture (types.ts `builtInId`, contract.ts, session-manager.ts env injection) already supports multiple built-in providers.
