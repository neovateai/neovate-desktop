# Default Multi-Project Support to Enabled

## 1. Background

Multi-project support is a fully implemented feature that allows users to work with multiple projects simultaneously. It is currently disabled by default (`multiProjectSupport: false`). This change enables it by default for all new installations.

## 2. Requirements Summary

**Goal:** Change the default value of `multiProjectSupport` from `false` to `true` so new users get multi-project mode out of the box.

**Scope:**

- In scope: Flip the default in `DEFAULT_APP_CONFIG`
- Out of scope: Any feature changes to multi-project mode itself

## 3. Acceptance Criteria

1. New installations default to multi-project mode enabled
2. Existing users who explicitly set the value retain their choice
3. `bun ready` passes with no regressions

## 4. Decision Log

**1. Will existing users be affected?**

- Options: A) Yes, all users switch to true · B) No, electron-store preserves explicit values
- Decision: **B)** — `electron-store` only applies defaults for absent keys. Users who toggled the setting have an explicit value persisted in `~/.neovate-desktop/config.json`

## 5. Design

Single-line change in `packages/desktop/src/main/features/config/config-store.ts` line 23:

```diff
- multiProjectSupport: false,
+ multiProjectSupport: true,
```

## 6. Files Changed

- `packages/desktop/src/main/features/config/config-store.ts` — change default from `false` to `true`

## 7. Verification

1. [AC1] Fresh install (or delete `~/.neovate-desktop/config.json`) shows multi-project sidebar
2. [AC2] Existing config with `"multiProjectSupport": false` stays in single-project mode
3. [AC3] `bun ready` passes
