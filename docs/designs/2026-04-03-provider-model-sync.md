# Provider Model Sync from Templates

## Problem

When a provider template is updated (e.g., ZenMux adds new models), users who already have that provider configured don't see the new models. They must either manually add them or "Reset to Defaults" (which overwrites all customizations). We need a lightweight sync mechanism.

## Requirements

- **Scope**: Additive only — add new models from template, never remove or modify existing user models
- **Trigger**: Check diffs when user opens the Providers settings panel
- **List page**: Inline badge on each provider row that has new models available
- **Edit page**: "Sync" button with preview to pull in new models; "recommended default changed" hint for modelMap drift
- **Applies to**: Template-based providers only (those with `builtInId`)

## Approach: Computed Diff (minimal persistence)

Compute template-vs-provider model diff on-the-fly when the settings panel renders. One new field `dismissedSyncModels` on `Provider` prevents permanent nagging when a user intentionally skips or removes template models.

The effective diff is: `templateModelIds - providerModelIds - dismissedSyncModels`.

### Why this approach?

- Diff is always fresh against the current template
- Sync is idempotent
- `dismissedSyncModels` is the minimal state needed to avoid the permanent nag problem (see below)
- No migration infrastructure — just one optional field on `Provider`

## Design

### 1. Dismissed Models — Preventing Permanent Nag

**Problem**: Without tracking dismissals, if a user removes model B from their provider, the diff still shows B as "new" because `templateModels - providerModels` includes it. The badge nags forever.

**Solution**: Add `dismissedSyncModels?: string[]` to the `Provider` type. The diff computation excludes these IDs.

A model ID is added to `dismissedSyncModels` when:

- User removes a model from their provider that exists in the template
- User explicitly dismisses a sync suggestion (clicks "dismiss" instead of "sync")

A model ID is removed from `dismissedSyncModels` when:

- User manually re-adds that model (they changed their mind)
- User clicks "Reset to Defaults" (full reset clears the list)

### 2. Diff Computation (shared utility)

New functions in `src/shared/features/provider/`:

```typescript
// New models available from template that user hasn't synced or dismissed
function getNewTemplateModels(
  provider: Provider,
  template: ProviderTemplate,
): Record<string, { displayName?: string }>;
```

- Computes: `templateModelIds - providerModelIds - (provider.dismissedSyncModels ?? [])`
- Returns empty `{}` if no `builtInId`, template not found, or no diff

```typescript
// ModelMap slots where template's recommended model differs from provider's current value
function getModelMapDrift(
  provider: Provider,
  template: ProviderTemplate,
): Partial<ProviderModelMap>;
```

- For each modelMap slot (model, haiku, opus, sonnet): if template's value differs from provider's value AND the template's target model exists in the provider's models, include in result
- Returns empty `{}` if no drift
- Ignores slots where template value is empty

Both are pure functions, no side effects, easily testable.

### 3. Provider List Page — Inline Badge

On each provider row where `getNewTemplateModels()` returns non-empty:

- Show a small badge next to the provider name: **"N new models"**
- Style: accent color (`#fa216e`), similar to existing template badges ("recommended", "new")
- Badge disappears reactively once the user syncs or dismisses all

No new data fetching — template list is already available via `contributions.providerTemplates`, provider list is already in the store.

### 4. Provider Edit Page — Sync Section

When editing a template-based provider with available changes:

#### New Models (from `getNewTemplateModels`)

- Show a **"Sync N new models"** button in the Models section header
- Below the button, show an **expandable preview list** of the models that will be added:
  ```
  ▸ Sync 3 new models          [Sync] [Dismiss]
    ┌──────────────────────────────────┐
    │  claude-opus-4-6    Claude Opus  │
    │  claude-haiku-4-5   Claude Haiku │
    │  gpt-4o             GPT-4o       │
    └──────────────────────────────────┘
  ```
- **Sync** button: merges all new models into local form state, fills empty modelMap slots
- **Dismiss** button: adds all listed model IDs to local form state's `dismissedSyncModels`
- Both actions update form state only — user saves everything together with the existing **Save** button

On sync:

1. Merge new models into local form state's `models` record
2. Fill empty `modelMap` slots if template's modelMap references newly added models
3. Clear test results (new models untested)
4. Section disappears (diff against form state is now empty)
5. User clicks **Save** to persist all changes (sync + any other edits) together

#### ModelMap Drift (from `getModelMapDrift`)

When template's recommended defaults have changed:

- Show a subtle **info hint** below the Model Map section:
  ```
  ℹ Template recommends: model → claude-opus-4-6 (currently claude-sonnet-4-6)  [Apply] [Dismiss]
  ```
- **Apply**: updates the modelMap slot in local form state (persisted on Save)
- **Dismiss**: hides the hint (dismiss state stored in component, not persisted — low stakes, can reappear next visit)
- Style: muted, not accent-colored — this is informational, not urgent
- Each slot shown independently so user can apply selectively

### 5. Data Flow

```
Panel opens
  → store.load() fetches providers (existing behavior)
  → contributions.providerTemplates already available
  → For each provider with builtInId:
      newModels = getNewTemplateModels(provider, matchingTemplate)
      mapDrift  = getModelMapDrift(provider, matchingTemplate)
  → List view: show badge if newModels non-empty
  → Edit view: show sync section if newModels non-empty
  → Edit view: show modelMap hint if mapDrift non-empty

User clicks "Sync N new models"
  → Merge new models into local form state's models
  → Fill empty modelMap slots in form state from template
  → Sync section disappears (diff against form state is now empty)
  → Form is now dirty — user clicks Save to persist

User clicks "Dismiss" on new models
  → Add model IDs to form state's dismissedSyncModels
  → Sync section disappears
  → Form is now dirty — user clicks Save to persist

User clicks "Apply" on modelMap drift hint
  → Update modelMap slot in form state
  → Hint disappears
  → Form is now dirty — user clicks Save to persist

User clicks Save
  → store.updateProvider(id, { models, modelMap, dismissedSyncModels, ...otherEdits })
  → oRPC → main process persists all changes atomically
  → List badge updates reactively

User clicks Cancel (after sync/dismiss without saving)
  → Form state reverts to persisted provider state
  → Sync section / badge reappears (changes were not persisted)

User removes a model that's in the template (in form state)
  → (existing behavior) remove from form state's models
  → (new) also add to form state's dismissedSyncModels
  → Persisted on Save — prevents badge from reappearing for that model
```

### 6. Files to Change

| File                                                                       | Change                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/shared/features/provider/types.ts`                                    | Add `dismissedSyncModels?: string[]` to `Provider`                          |
| `src/shared/features/provider/` (new util)                                 | `getNewTemplateModels()`, `getModelMapDrift()`                              |
| `src/renderer/src/features/settings/components/panels/providers-panel.tsx` | List: badge on rows. Edit: sync preview section + modelMap drift hint       |
| `src/renderer/src/features/provider/store.ts`                              | Optional: `syncModelsFromTemplate()` convenience if form logic gets complex |

No contract changes needed (update already accepts partial Provider). No main process router changes. No migration (field is optional, defaults to undefined/empty).

### 7. Error Handling

- Template not found for `builtInId` (e.g., template removed in code update): silently skip, no badge
- Sync is idempotent — clicking twice is harmless (second time diff is empty)
- Dismiss is idempotent — dismissing already-dismissed models is a no-op
- No network calls — all local data
