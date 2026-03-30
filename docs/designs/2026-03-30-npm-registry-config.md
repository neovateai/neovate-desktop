# Default NPM Registry Configuration

## 1. Background

Users in certain regions (e.g., China) need to use alternative npm registries (e.g., npmmirror) when installing npm-type skills. Currently, custom registries can only be set per-package via `?registry=<url>` in the sourceRef. There is no global default.

## 2. Requirements Summary

**Goal:** Add a global default npm registry URL that NpmInstaller uses as fallback.

**Scope:**

- In scope: AppConfig, config contract, config stores, NpmInstaller, General settings UI, i18n
- Out of scope: `skillsRegistryUrls` UI, per-package `?registry=` behavior changes

## 3. Acceptance Criteria

1. New `npmRegistry` string field exists in `AppConfig` (default: `""`)
2. NpmInstaller resolves registry as: per-package `?registry=` > global `npmRegistry` > npm built-in
3. Settings UI provides a text input in General panel to enter/clear the URL
4. i18n keys exist for en-US and zh-CN

## 4. Problem Analysis

- Current NpmInstaller supports per-package registry via `?registry=` query param in sourceRef
- No global fallback exists — users must add `?registry=` to every npm skill source
- The change slots naturally into the existing `registry` resolution in `parseSourceRef` / `fetchAndExtract` / `getLatestVersion`

## 5. Decision Log

**1. Config key name?**

- Options: A) `npmRegistry` · B) `skillsNpmRegistry` · C) `defaultNpmRegistry`
- Decision: **A) `npmRegistry`** — concise, matches npm terminology

**2. How NpmInstaller gets the default registry?**

- Options: A) Pass ConfigStore to constructor · B) Pass getter callback · C) SkillsService injects into sourceRef
- Decision: **B) Pass getter callback `() => string | undefined`** — minimal coupling, testable

**3. Where in settings UI?**

- Options: A) General panel, new "Skills" group · B) Chat panel · C) Skills panel
- Decision: **A) General panel, new "Skills" group** — config belongs in settings page, not management panel

**4. URL validation?**

- Options: A) `z.string().url()` · B) `z.string()` · C) `z.string().url().or(z.literal(""))`
- Decision: **C)** — empty string = "use npm default", non-empty must be valid URL. Trailing slashes stripped via `.transform(v => v.replace(/\/+$/, ''))` to prevent inconsistent storage. `electron-store` does not persist `undefined`, so empty string serves as "not set".

## 6. Design

### NpmInstaller changes

Constructor accepts optional `getDefaultRegistry` callback. The resolved registry for all three consuming methods (`scan`, `install`, `getLatestVersion`) and the private `fetchAndExtract` becomes:

```
const effectiveRegistry = registry ?? this.getDefaultRegistry?.() ?? undefined;
```

Where `registry` is the per-package value from `parseSourceRef`. This ensures update checks also use the global registry.

### SkillsService wiring

```ts
new NpmInstaller(() => this.configStore.get("npmRegistry") || undefined);
```

### Config flow

`AppConfig.npmRegistry` (string, default `""`) -> config contract validates (trailing slashes stripped) -> ConfigStore persists -> renderer store syncs via oRPC -> General panel UI with debounced input (same local-state + useEffect pattern as `terminalFont`, 500ms). Client-side URL validation via `new URL()` try/catch before calling `setConfig`, with inline error styling on invalid input.

## 7. Files Changed

- `src/shared/features/config/types.ts` — add `npmRegistry: string` to AppConfig
- `src/shared/features/config/contract.ts` — add npmRegistry validator to set union
- `src/main/features/config/config-store.ts` — add default `npmRegistry: ""`
- `src/renderer/src/features/config/store.ts` — add default `npmRegistry: ""`
- `src/main/features/skills/installers/npm.ts` — accept getter, use as fallback
- `src/main/features/skills/skills-service.ts` — pass getter to NpmInstaller
- `src/renderer/src/features/settings/components/panels/general-panel.tsx` — add Skills group with input
- `src/renderer/src/locales/en-US.json` — add i18n keys
- `src/renderer/src/locales/zh-CN.json` — add i18n keys

## 8. Verification

1. [AC1] `npmRegistry` field exists in AppConfig type and both config store defaults
2. [AC2] NpmInstaller uses global registry when no per-package override; per-package still wins
3. [AC3] General settings shows "Skills" group with npm registry input; value persists
4. [AC4] Both locale files have the new keys
