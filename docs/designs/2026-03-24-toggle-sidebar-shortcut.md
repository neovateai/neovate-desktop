# Toggle Sidebar Shortcut (Cmd+B)

## 1. Background

Add Cmd+B keyboard shortcut to toggle the primary sidebar (session list) visibility, matching the standard convention used by VS Code and other editors.

## 2. Decision Log

**1. What does "sidebar" refer to?**

- Options: A) Primary sidebar (session list) · B) Secondary sidebar (files/git) · C) Both
- Decision: **A) Primary sidebar** — Cmd+B conventionally toggles the main left sidebar. Secondary sidebar already has individual toggles.

**2. Where to register the keybinding?**

- Options: A) Renderer keybindings system only · B) Also add Electron menu accelerator
- Decision: **A) Renderer only** — All customizable keybindings follow this pattern. Menu has only non-customizable system shortcuts.

**3. Handler placement relative to settings guard?**

- Options: A) Before `if (showSettings) return` · B) After it
- Decision: **A) Before** — Sidebar toggle is a layout-level concern, should work regardless of settings panel state. Matches `toggleTheme` and `toggleMultiProject`.

**4. Should it be user-customizable?**

- Options: A) Yes · B) Add to READONLY_ACTIONS
- Decision: **A) Yes** — All other `toggle*` actions are customizable. No reason to lock this one.

## 3. Design

Add `toggleSidebar` as a new `KeybindingAction` with default binding `Cmd+B`. The handler calls `layoutStore.getState().togglePanel("primarySidebar")` fire-and-forget (no await), matching existing patterns. The `togglePanel` method already handles collapse/expand with window resizing.

No Cmd+B conflict exists — `Cmd+Shift+B` is used by `toggleBrowser` but `Cmd+B` is free.

## 4. Files Changed

- `src/renderer/src/lib/keybindings.ts` — Add `toggleSidebar` to union, defaults, labels, label keys
- `src/renderer/src/hooks/use-global-keybindings.ts` — Add handler before settings guard
- `src/renderer/src/features/settings/components/panels/keybindings-panel.tsx` — Add to KEYBINDING_ACTIONS display array
- `src/renderer/src/locales/en-US.json` — Add translation key
- `src/renderer/src/locales/zh-CN.json` — Add translation key

## 5. Verification

1. Press Cmd+B — primary sidebar collapses
2. Press Cmd+B again — primary sidebar expands
3. Open settings, press Cmd+B — sidebar still toggles
4. Check keybindings panel in settings — "Toggle Sidebar" appears and is customizable
