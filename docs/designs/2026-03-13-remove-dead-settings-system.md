# Remove Dead Settings System

## Problem

Two parallel settings/config systems coexisted in the codebase:

1. **`shared/features/settings/` + `SettingsService`** — a Zod-validated, scoped, debounced settings system persisted via generic Storage RPC
2. **`shared/features/config/` + `useConfigStore`** — a flat Zustand store with per-field orpc RPC, persisted via `ConfigStore` (electron-store)

System 2 is the one actually used by all UI components (theme, keybindings, terminal, i18n, developer mode, etc.). System 1 was hydrated at startup and persisted on change, but **never read** — no code called `app.settings.scoped(...)` or consumed the `SettingsStore`.

### Specific issues

| Issue             | Detail                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Dead schema       | `preferencesSchema` defined only `theme` + `fontSize`, while the real config has 14+ fields         |
| Unused service    | `SettingsService` hydrated at startup but `.scoped()` never called                                  |
| Duplicate `theme` | Defined in both `preferencesSchema` and `AppConfig`                                                 |
| `fontSize` drift  | Settings schema had `fontSize`, config had `terminalFontSize` — neither referenced the other        |
| Dead interfaces   | `ISettingsService` + `IScopedSettings` in `core/types.ts` part of `IRendererApp` but never consumed |

## Decision

Delete System 1 entirely. It was designed for plugin-scoped settings (per the original storage design doc), but that use case never materialized. If needed in the future, it can be rebuilt on top of the existing config system.

## Changes

### Deleted files

- `shared/features/settings/schema.ts` — Zod schema (`preferencesSchema`, `settingsSchema`, defaults)
- `shared/features/settings/index.ts` — barrel re-exports
- `renderer/features/settings/service.ts` — `SettingsService` class
- `renderer/features/settings/hooks.ts` — `useSettings` hook
- `renderer/features/settings/__tests__/service.test.ts`
- `renderer/features/settings/__tests__/types.test-d.ts`

### Edited files

- **`renderer/features/settings/store.ts`** — removed `createSettingsStore` and related imports; kept `useSettingsStore` (settings modal UI state)
- **`renderer/features/settings/index.ts`** — removed `SettingsService` and `useSettings` exports
- **`renderer/core/types.ts`** — removed `ISettingsService`, `IScopedSettings`, `settings` from `IRendererApp`
- **`renderer/core/app.tsx`** — removed `SettingsService` instantiation, `hydrate()`, `settings.dispose()`
- **`renderer/core/__tests__/plugin-manager.test.ts`** — removed `settings` from mock app

### What remains

- `renderer/features/settings/store.ts` — `useSettingsStore` (UI state: `showSettings`, `activeTab`)
- `renderer/features/settings/components/` — all settings UI panels (unchanged)
- `shared/features/config/` — the active config system (unchanged)
