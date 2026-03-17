# Contribution i18n: contentPanelView Name

## Problem

`ContentPanelView.name` is a hardcoded English string. The framework renders it in tab titles and new-tab menus, so plugins cannot control the translation timing themselves. The current `%namespace:key%` NLS marker pattern works but has issues:

1. **Magic string syntax** — `%namespace:key%` is a custom convention with no type safety; typos are silent failures
2. **Regex-based resolution** — `useTranslationWithMarker` parses markers with regex at render time
3. **Indirection** — plugin writes a string marker, framework regex-parses it, then calls i18next; unnecessary layer
4. **Scattered translations** — `view.*` keys live in plugin locale JSON files, adding indirection between the contribution definition and the display string

## Design

### Inline Locale Map

Replace `%namespace:key%` markers with inline locale maps directly in contribution definitions. The `name` field becomes `string | Record<Locales, string>`.

```
Plugin defines                                          Rendered (zh-CN)
{ "en-US": "Git Diff", "zh-CN": "代码变更" }    →     "代码变更"
```

### Why Inline Map Over Markers

| Aspect             | `%namespace:key%` markers                   | Inline `Record<Locales, string>`       |
| ------------------ | ------------------------------------------- | -------------------------------------- |
| Type safety        | None — typos are silent                     | Full — missing locale is a TS error    |
| Resolution         | Regex parse + i18next lookup                | Simple property access                 |
| Data locality      | Split across contribution def + locale JSON | Co-located in contribution def         |
| i18next dependency | Required for contribution names             | None — just reads a config store value |
| Complexity         | Hook + regex + namespace routing            | One utility function                   |

### `resolveLocalizedString` Utility

```typescript
import type { Locales } from "../core/i18n";

export type LocalizedString = string | Record<Locales, string>;

export function resolveLocalizedString(value: LocalizedString, locale: Locales): string {
  if (typeof value === "string") return value;
  return value[locale] ?? value["en-US"];
}
```

- Plain `string`: returned as-is (backward compatible, useful for demos/prototypes)
- `Record<Locales, string>`: looks up by current locale, falls back to `en-US`
- Reactive: rendering components subscribe to locale changes via `useConfigStore(s => s.locale)`

### Plugin Usage

```typescript
const plugin: RendererPlugin = {
  name: "plugin-git",

  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "git-diff",
          name: { "en-US": "Git Diff", "zh-CN": "代码变更" },
          icon: GitIcon,
          component: () => import("./git-diff-view"),
        },
      ],
    };
  },
};
```

### Rendering

```tsx
const locale = useConfigStore((s) => s.locale);
const displayName = resolveLocalizedString(view.name, locale);
```

Components rendering contribution names subscribe to `useConfigStore(s => s.locale)` for reactivity. No i18next hooks needed for this path.

### Future: `() => string` Lazy Functions

The inline map covers the common case. If plugins later need dynamic names (e.g., interpolation, context-dependent text), the type can be extended to `string | Record<Locales, string> | (() => string)`. The inline map is forward-compatible with this extension.

## Changes

### New: `LocalizedString` type and `resolveLocalizedString` utility

- Type: `string | Record<Locales, string>`
- Location: `src/renderer/src/lib/i18n.ts`

### Modify: `ContentPanelView.name` type

```typescript
// Before
name: string;

// After
name: LocalizedString;
```

### Delete: `useTranslationWithMarker` hook

- `core/i18n/hooks/use-translation-with-marker.ts`
- `core/i18n/hooks/__tests__/use-translation-with-marker.test.ts`
- Remove export from `core/i18n/index.ts`

### Migrate: Rendering Components

| File                                                 | Before                                                 | After                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `features/content-panel/components/tab-item.tsx`     | `useTranslationWithMarker()` → `t(view.name)`          | `useConfigStore(s => s.locale)` → `resolveLocalizedString(view.name, locale)`              |
| `features/content-panel/components/new-tab-menu.tsx` | `useTranslationWithMarker()` → `t(view.name)`          | `useConfigStore(s => s.locale)` → `resolveLocalizedString(view.name, locale)`              |
| `components/app-layout/content-panel-tabs.tsx`       | `useTranslationWithMarker()` → `tMarker(view.name)`    | `useConfigStore(s => s.locale)` → `resolveLocalizedString(view.name, locale)`              |
| `components/app-layout/app-layout.tsx`               | `useTranslationWithMarker()` → `tMarker(item.tooltip)` | Remove `tMarker`, use `item.tooltip` directly (no active plugins use markers for tooltips) |

### Plugin Changes

Each plugin with `contentPanelViews` replaces `%namespace:key%` markers with inline locale maps.

| Plugin   | `name` before                       | `name` after                                   |
| -------- | ----------------------------------- | ---------------------------------------------- |
| editor   | `"%plugin-editor:view.editor%"`     | `{ "en-US": "Editor", "zh-CN": "编辑器" }`     |
| git      | `"%plugin-git:view.gitDiff%"`       | `{ "en-US": "Git Diff", "zh-CN": "代码变更" }` |
| terminal | `"%plugin-terminal:view.terminal%"` | `{ "en-US": "Terminal", "zh-CN": "终端" }`     |
| review   | `"%plugin-review:view.review%"`     | `{ "en-US": "Review", "zh-CN": "评审" }`       |

### Cleanup: Plugin Locale Files

Delete `view.*` keys from plugin locale JSON files (now inlined into contributions):

| Plugin                                | Key to delete     |
| ------------------------------------- | ----------------- |
| `plugins/editor/locales/en-US.json`   | `"view.editor"`   |
| `plugins/editor/locales/zh-CN.json`   | `"view.editor"`   |
| `plugins/git/locales/en-US.json`      | `"view.gitDiff"`  |
| `plugins/git/locales/zh-CN.json`      | `"view.gitDiff"`  |
| `plugins/terminal/locales/en-US.json` | `"view.terminal"` |
| `plugins/terminal/locales/zh-CN.json` | `"view.terminal"` |
| `plugins/review/locales/en-US.json`   | `"view.review"`   |
| `plugins/review/locales/zh-CN.json`   | `"view.review"`   |

## Scope

This design covers `contentPanelView.name` only. Other contribution fields (`activityBarItem.tooltip`, `secondarySidebarView.title`, `titlebarItem.tooltip`) can adopt the same `LocalizedString` pattern later but are not in scope.
