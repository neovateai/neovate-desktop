# Contribution i18n: contentPanelView Name

## Problem

`ContentPanelView.name` is a hardcoded English string. The framework renders it in tab titles and new-tab menus, so plugins cannot control the translation timing themselves. Currently, the renderer works around this with `t(`tab.${name}`)` and hardcoded keys in app-level locale files (`"tab.Git Diff": "代码变更"`), which:

1. Couples plugin display strings to app-level locale files
2. Requires a manually maintained `TabName` union type
3. Breaks plugin encapsulation — adding a plugin means editing app locale files

## Design

### NLS Marker Pattern

Adopt VS Code's `%key%` marker convention. Plugins write `%namespace:key%` in contribution fields; the framework resolves them at render time via i18next.

```
Plugin defines          Stored in tab           Rendered
"%plugin-git:view.gitDiff%"  →  (stored as-is)  →  "代码变更"
```

### `useTranslationWithMarker` Hook

A new React hook in `core/i18n/hooks/use-translation-with-marker.ts` that resolves `%namespace:key%` markers reactively (language switch triggers re-render).

```typescript
const NLS_MARKER_RE = /^%([^%]+)%$/;

export function useTranslationWithMarker() {
  const { t } = useTranslation();
  return (value: string) => {
    const match = NLS_MARKER_RE.exec(value);
    return match ? t(match[1]) : value;
  };
}
```

- Marker detected: strips `%`, passes `namespace:key` to `t()` (i18next native colon syntax)
- Non-marker: returns the original string as-is
- Reactive: backed by `useTranslation`, re-renders on language change

### Why Not a Pure Function

The existing `resolveNls()` in `contributions.ts` calls `i18next.t()` directly. This is not reactive — language changes don't trigger React re-renders. A hook is required.

### Future: Auto Namespace Injection

Currently plugins write the full `%namespace:key%`. In the future, the framework can auto-inject the namespace during contribution collection (since `plugin.name` equals the i18n namespace), letting plugins write just `%key%`. This requires refactoring `configContributions()` to preserve plugin origin info, deferred for now.

## Changes

### New: `core/i18n/hooks/use-translation-with-marker.ts`

- `useTranslationWithMarker()` hook
- Export from `core/i18n/index.ts`

### Remove: `resolveNls` from `core/plugin/contributions.ts`

Delete `resolveNls` and `NLS_REGEX`. All call sites migrate to `useTranslationWithMarker`.

### Migrate: `app-layout.tsx` (titlebar tooltip)

Replace `resolveNls(item.tooltip)` with `useTranslationWithMarker()`.

### Migrate: `tab-item.tsx`

| Before                                       | After                                                    |
| -------------------------------------------- | -------------------------------------------------------- |
| `t(`tab.${tab.name as TabName}`)`            | `tMarker(tab.name)`                                      |
| `view.name === tab.name` (find view by name) | `view.viewType === tab.viewType` (find view by viewType) |
| `"{tab.name}" is unavailable` tooltip        | `tMarker(tab.name)`                                      |
| `type TabName = "Editor" \| ...`             | Delete                                                   |

### Migrate: `new-tab-menu.tsx`

| Before                             | After                |
| ---------------------------------- | -------------------- |
| `t(`tab.${view.name as TabName}`)` | `tMarker(view.name)` |
| `type TabName = "Editor" \| ...`   | Delete               |

### Plugin Changes

Each plugin with `contentPanelViews` updates `name` to NLS marker and adds translation keys to its own locale files.

| Plugin             | `name` before        | `name` after                                       | en-US key                                  | zh-CN value                           |
| ------------------ | -------------------- | -------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| editor             | `"Editor"`           | `"%plugin-editor:view.editor%"`                    | `"view.editor": "Editor"`                  | `"view.editor": "编辑器"`             |
| git                | `"Git Diff"`         | `"%plugin-git:view.gitDiff%"`                      | `"view.gitDiff": "Git Diff"`               | `"view.gitDiff": "代码变更"`          |
| terminal           | `"Terminal"`         | `"%plugin-terminal:view.terminal%"`                | `"view.terminal": "Terminal"`              | `"view.terminal": "终端"`             |
| review             | `"Review"`           | `"%plugin-review:view.review%"`                    | `"view.review": "Review"`                  | `"view.review": "评审"`               |
| content-panel-demo | `"Demo (Singleton)"` | `"%plugin-content-panel-demo:view.demoSingleton%"` | `"view.demoSingleton": "Demo (Singleton)"` | `"view.demoSingleton": "演示 (单例)"` |

### Cleanup: App-Level Locale Files

Delete from `locales/en-US.json` and `locales/zh-CN.json`:

```json
"tab.Editor": "...",
"tab.Git Diff": "...",
"tab.Terminal": "...",
"tab.Review": "..."
```

## Scope

This design covers `contentPanelView.name` only. Other contribution fields (`activityBarItem.tooltip`, `secondarySidebarView.title`) can adopt the same marker pattern later but are not in scope — plugins can handle those with `useTranslation` in their own components.
