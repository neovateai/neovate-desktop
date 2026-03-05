# Plugin i18n Support Design

**Date:** 2026-03-05
**Branch:** feat/plugin-i18n
**Status:** Approved

## Overview

Allow renderer plugins to contribute their own translations, scoped to a namespace, with lazy loading and full TypeScript type safety. Translations follow the app's locale setting automatically.

## Decisions

### Plugin Naming Convention

All plugins use the format `plugin-<name>` (e.g., `plugin-files`, `plugin-git`). This name is the universal identifier used across all subsystems — plugin registry, i18n namespace, storage namespace. No special characters, consistent with the `vite-plugin-*` / `eslint-plugin-*` ecosystem convention.

Third-party plugins use `<vendor>-<name>` (e.g., `acme-search`).

Existing plugins are renamed from `builtin:files` → `plugin-files`, `builtin:git` → `plugin-git`.

### `configI18n` Hook

A new optional hook `configI18n` is added to `RendererPluginHooks`, at the same level as `configContributions`. It returns an `I18nContributions` object declaring the plugin's namespace and per-locale lazy loaders.

```typescript
interface I18nContributions {
  namespace: string; // equals plugin.name
  loaders: Partial<Record<Locales, () => Promise<Record<string, string>>>>;
}
```

The namespace is always the plugin's `name`, enforced by convention. Plugins do not need to re-declare it, but returning it explicitly keeps the contribution self-contained.

### Lazy Loading

Plugin Manager collects all `configI18n()` results before activation and passes them to `I18nManager.setupLazyNamespaces()`. The I18nManager (already implemented) loads the current locale immediately and re-loads on language change. Translations are cached per namespace per locale.

### Type Safety

Each plugin augments i18next's `CustomTypeOptions` using the English locale file as the source of truth for key types. Translation keys are checked at compile time when using `useTranslation`.

```typescript
// In plugin's i18n.ts
import enUS from "./locales/en-US.json";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: {
      "plugin-files": typeof enUS;
    };
  }
}

export const useFilesTranslation = () => useTranslation("plugin-files");
```

## Architecture

### Changes to Existing Files

**`core/plugin/types.ts`** — Add `configI18n` to `RendererPluginHooks`:

```typescript
export interface RendererPluginHooks {
  configContributions(): PluginContributions;
  configI18n(): I18nContributions; // new
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate(): void;
}
```

**`core/plugin/plugin-manager.ts`** — Collect i18n contributions and register before activation:

```typescript
// After collecting configContributions, before activate
const i18nConfigs = this.plugins
  .filter((p) => p.configI18n)
  .map((p) => {
    const contrib = p.configI18n!();
    return {
      namespace: contrib.namespace,
      loader: (locale: Locales) => contrib.loaders[locale]?.() ?? Promise.resolve({}),
    };
  });

if (i18nConfigs.length) {
  ctx.app.i18nManager.setupLazyNamespaces(i18nConfigs);
}
```

**`core/i18n/types.ts`** (new file) — Export `I18nContributions` so plugins can import it without depending on the manager:

```typescript
import type { Locales } from "./locales";

export interface I18nContributions {
  namespace: string;
  loaders: Partial<Record<Locales, () => Promise<Record<string, string>>>>;
}
```

### Plugin File Structure

Each plugin that supports i18n adds:

```
plugins/files/
├── index.ts          # plugin definition, includes configI18n
├── i18n.ts           # type augmentation + typed useTranslation hook
└── locales/
    ├── en-US.json
    └── zh-CN.json
```

### Plugin Example (files)

```typescript
// plugins/files/i18n.ts
import { useTranslation } from "react-i18next";
import enUS from "./locales/en-US.json";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: {
      "plugin-files": typeof enUS;
    };
  }
}

export const useFilesTranslation = () => useTranslation("plugin-files");
```

```typescript
// plugins/files/index.ts
import type { RendererPlugin } from "../../core/plugin/types";

export const filesPlugin: RendererPlugin = {
  name: "plugin-files",

  configI18n() {
    return {
      namespace: "plugin-files",
      loaders: {
        "en-US": () => import("./locales/en-US.json"),
        "zh-CN": () => import("./locales/zh-CN.json"),
      },
    };
  },

  configContributions() {
    /* ... */
  },
  activate(ctx) {
    /* ... */
  },
};
```

## What Is Not Changing

- `I18nManager` implementation — `setupLazyNamespaces` and `registerResources` already support this pattern
- App-level locale files at `src/renderer/src/locales/` — plugin translations are additive
- Locale detection and persistence — unchanged
- Main process plugins — no i18n hook needed (no UI)

## Out of Scope

- Runtime plugin loading (all plugins are known at build time)
- Fallback locale per plugin (inherits app's `fallbackLng: "en-US"`)
- Plugin translation editing UI
