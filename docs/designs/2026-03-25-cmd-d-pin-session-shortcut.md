# Cmd+D Shortcut to Pin Session

## 1. Background

Users can pin sessions via context menu or dropdown menu on session items. Adding a keyboard shortcut (Cmd+D) provides a faster way to toggle pin on the active session without reaching for the mouse.

## 2. Decision Log

**1. Which keybinding?**

- Options: A) Cmd+D · B) Cmd+P · C) Cmd+Shift+P
- Decision: **A) Cmd+D** — User requested, not taken by any existing binding

**2. What does the shortcut do?**

- Options: A) Toggle pin on active session · B) Open a session picker
- Decision: **A) Toggle pin on active session** — Direct, reuses existing `togglePinSession` store method

**3. Should it work on new sessions?**

- Options: A) No-op · B) Allow
- Decision: **A) No-op** — Consistent with session-actions-menu which disables pin for `isNew`

**4. Customizable?**

- Options: A) Yes · B) Read-only
- Decision: **A) Yes** — Consistent with most keybindings

**5. Handler placement?**

- Decision: In `use-global-keybindings.ts` after the `if (showSettings) return` guard

## 3. Design

Add `togglePinSession` as a new `KeybindingAction`. The handler reads the active session ID and project path from stores, checks that the session exists and is not new, then calls `useProjectStore.getState().togglePinSession()`.

## 4. Files Changed

- `src/renderer/src/lib/keybindings.ts` — Add type, default `Cmd+D`, labels, label keys
- `src/renderer/src/hooks/use-global-keybindings.ts` — Add handler after settings guard
- `src/renderer/src/features/settings/components/panels/keybindings-panel.tsx` — Add to actions list
- `src/renderer/src/locales/en-US.json` — Add `settings.keybindings.togglePinSession`
- `src/renderer/src/locales/zh-CN.json` — Add `settings.keybindings.togglePinSession`

## 5. Verification

1. Press Cmd+D with an active non-new session → session appears in pinned list
2. Press Cmd+D again → session removed from pinned list
3. Press Cmd+D with a new (empty) session → nothing happens
4. Customize the binding in Settings > Keybindings → new binding works
5. `bun ready` passes
