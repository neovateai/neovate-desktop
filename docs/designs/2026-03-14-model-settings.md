# Model Setting in Chat Settings Page

## Summary

Replace the "Coming Soon" placeholder in the chat settings panel with a model selector.

- **Single SettingsRow** with a Menu trigger showing current selection (e.g. "SDK Default / Claude Sonnet 4")
- Clicking opens a grouped Menu dropdown — same UX pattern as the toolbar `ModelSelect`
- Provider groups as headers, models as radio items within each group
- "Default (auto)" option at the top to reset to SDK defaults
- When no custom providers exist, provider group headers are hidden — just a flat model list
- Fetches current global selection from backend on mount to avoid stale state
- Sets the **global default** model, used when no session/project override exists

## UI

```
With providers:

│ Model                                            │
│ Set the default model for new sessions           │
│                                                  │
│  ┌──────────────────────────────────┐            │
│  │ SDK Default / Claude Sonnet 4  ▼ │            │
│  ├──────────────────────────────────┤            │
│  │ Default (auto)                   │            │
│  │ ─────────────────────            │            │
│  │ SDK Default                      │            │
│  │   ○ Claude Sonnet 4              │            │
│  │   ○ Claude Haiku 3.5             │            │
│  │   ○ Claude Opus 4                │            │
│  │ ─────────────────────            │            │
│  │ My Provider                      │            │
│  │   ○ gpt-4o                       │            │
│  │   ○ gpt-4o-mini                  │            │
│  └──────────────────────────────────┘            │

No providers configured:

│ Model                                            │
│ Set the default model for new sessions           │
│                                                  │
│  ┌──────────────────────────────────┐            │
│  │ Default (auto)                ▼  │            │
│  ├──────────────────────────────────┤            │
│  │ Default (auto)                   │            │
│  │ ─────────────────────            │            │
│  │   ○ Claude Sonnet 4              │            │
│  │   ○ Claude Haiku 3.5             │            │
│  │   ○ Claude Opus 4                │            │
│  └──────────────────────────────────┘            │
```

Selecting a model implicitly sets the provider (from the group it belongs to).

## Data Flow

### Reading current selection

- Provider: `configStore.getGlobalSelection().provider`
- Model:
  - If provider set: `configStore.getGlobalSelection().model`
  - If SDK Default: `~/.claude/settings.json` → `model` key

### Writing selection

- Model in provider group selected: `configStore.setGlobalSelection(providerId, model)` + clear `~/.claude/settings.json` model
- Model in SDK Default group selected: `configStore.setGlobalSelection(null, null)` + `writeModelSetting("global", model, {})`
- **Default (auto)** selected: clear both stores so SDK picks its own default

### Getting available models

- For providers: `provider.models` from config (always available)
- For SDK Default: `agentStore.sessions[id].availableModels` from any active pre-warmed session (almost always available; shows only "Default (auto)" if no session exists)

### Refresh on mount

- On settings panel mount, call `client.config.getGlobalModelSelection()` to get the current global selection
- Avoids stale state when the user changes the global model from the toolbar (right-click → "Set as global default") and then opens settings

## Backend Changes

### 1. Config contract (`shared/features/config/contract.ts`)

Add 2 endpoints:

```typescript
getGlobalModelSelection: oc.output(type<{ providerId?: string; model?: string }>());

setGlobalModelSelection: oc.input(
  z.object({
    providerId: z.string().nullable(),
    model: z.string().nullable(),
  }),
).output(type<void>());
```

### 2. Config router (`main/features/config/router.ts`)

Implement the two endpoints:

- `getGlobalModelSelection`:
  - Read `configStore.getGlobalSelection()` → `{ provider?, model? }`
  - If no provider, also read `~/.claude/settings.json` for SDK Default model (reuse `readJsonFile` from `claude-settings.ts`)
  - Return combined `{ providerId, model }`

- `setGlobalModelSelection`:
  - If `providerId` is non-null:
    - `configStore.setGlobalSelection(providerId, model)`
    - Clear `~/.claude/settings.json` model to avoid conflict
  - If `providerId` is null (SDK Default):
    - `configStore.setGlobalSelection(null, null)`
    - If model is non-null: `writeModelSetting("global", model, {})`
    - If model is null: `writeModelSetting("global", null, {})` (reset to auto)

## Frontend Changes

### chat-panel.tsx

Replace "Coming Soon" block (lines 58-69) with a single `<SettingsRow>`:

- **Menu trigger**: shows `"Provider / Model"`, `"Model"` (no provider), or `"Default (auto)"`
- **Menu dropdown** (grouped, same pattern as toolbar `ModelSelect`):
  - `MenuRadioItem` for "Default (auto)" at top
  - Separator
  - SDK Default group header (only when providers exist)
  - `MenuRadioItem` for each SDK model (from `useAgentStore` active sessions)
  - Separator (only when providers exist)
  - Provider group headers + `MenuRadioItem` for each provider model
- Selected value encoded as `"providerId:model"` or `":model"` (SDK Default) or `""` (auto)
- On change: parse value, call `client.config.setGlobalModelSelection()`
- On mount: `useEffect` calls `client.config.getGlobalModelSelection()` to hydrate state

## i18n Keys

Add to translation files:

| Key                               | English                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `settings.chat.model`             | Model (already exists)                                  |
| `settings.chat.model.description` | Set the default model for new sessions (already exists) |
| `settings.chat.model.auto`        | Default (auto)                                          |
| `settings.chat.model.sdkDefault`  | SDK Default                                             |

## Files Modified

| File                                                              | Change                                           |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `shared/features/config/contract.ts`                              | Add 2 endpoints                                  |
| `main/features/config/router.ts`                                  | Implement endpoints                              |
| `renderer/src/features/settings/components/panels/chat-panel.tsx` | Replace "Coming Soon" with grouped Menu selector |
| i18n translation files                                            | Add new keys                                     |
