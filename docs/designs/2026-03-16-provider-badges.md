# Provider Template Badges

## Summary

Add a `badges` field to `ProviderTemplate` so plugin authors can tag templates with predefined semantic badges (e.g., "recommended", "internal", "new"). Badges display as small pills in the template picker grid. Templates are sorted by badge priority.

## Data Model

Add to `ProviderTemplate` in `src/shared/features/provider/built-in.ts`:

```ts
export type ProviderBadgeType = "recommended" | "internal" | "new" | "deprecated";

export type ProviderTemplate = {
  // ... existing fields ...
  badges?: ProviderBadgeType[];
};
```

Simple string array — no wrapper object, max 2 entries. Badge labels are resolved via i18n keys (`settings.providers.badge.<type>`).

## Semantic Badge Styles

| Type          | Label (en-US / zh-CN) | Badge Variant            | Sort Priority |
| ------------- | --------------------- | ------------------------ | ------------- |
| `internal`    | Internal / 内部       | `info` (blue tint)       | 1 (highest)   |
| `recommended` | Recommended / 推荐    | `success` (green tint)   | 2             |
| `new`         | New / 新              | `default` (primary pink) | 3             |
| `deprecated`  | Deprecated / 已弃用   | `warning` (amber tint)   | 4 (lowest)    |

## Template Sorting

Templates in the picker grid are sorted by highest-priority badge:

1. Templates with `internal` badge first
2. Then `recommended`
3. Then `new`
4. Then templates with no badges
5. Then `deprecated` last

Within the same priority tier, original order is preserved (stable sort).

The "Custom" card is always pinned last — it is not part of the sorted template list.

## Deprecated Visual Treatment

Templates with the `deprecated` badge are visually dimmed (`opacity-60`) to steer users toward active providers — still clickable unlike disabled cards.

**Opacity precedence:** If a template is both deprecated and already used (`isUsed`), the `isUsed` treatment wins (`opacity-40 cursor-not-allowed`) since it's a stronger constraint (disabled > dimmed).

## UI Change

In the template picker grid (~line 391 of `providers-panel.tsx`), render badges (max 2) next to the template name:

```
┌─────────────────────┐
│ OpenRouter  [推荐]   │
│ Compatible models    │
│ openrouter.ai        │
└─────────────────────┘
```

Badges use the existing `<Badge>` component with `size="sm"`.

## Files Changed

1. `src/shared/features/provider/built-in.ts` — add `ProviderBadgeType`, `badges` field to `ProviderTemplate`
2. `src/renderer/src/features/settings/components/panels/providers-panel.tsx` — render badges, sort templates, dim deprecated
3. i18n files — add `settings.providers.badge.*` keys

## Design Notes

- **Max 2 badges per template.** At `grid-cols-3`, cards are ~200px wide. More than 2 badges would wrap or overflow the name row.
- **i18n keys, not L10nText.** Other `ProviderTemplate` fields (`name`, `description`) use `L10nText` because they're defined by plugin authors who don't have access to the app's i18n files. Badge types are app-defined with a fixed set of labels, so standard i18n keys are cleaner and avoid redundant translations across every plugin.

## Scope

- No backend/IPC changes needed
- No persistence changes — badges are static template metadata defined by plugin authors
