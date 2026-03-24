# Panel Toggle Shortcuts

## Summary

Add 4 new panel toggle shortcuts + change 1 existing shortcut default.

| Action               | Default       | Behavior                                   |
| -------------------- | ------------- | ------------------------------------------ |
| `toggleChanges`      | `Cmd+E`       | Toggle "changes" content panel view        |
| `toggleTerminal`     | `Cmd+J`       | Toggle "terminal" content panel view       |
| `toggleBrowser`      | `Cmd+Shift+B` | Toggle "browser" content panel view        |
| `toggleFiles`        | `Cmd+G`       | Toggle "files" secondary sidebar view      |
| `toggleMultiProject` | `Cmd+Shift+E` | _(existing, default changed from `Cmd+E`)_ |

All 4 new shortcuts are **customizable** in keybindings settings.

## Toggle Behavior

### Content Panel Views (changes, terminal, browser)

1. **View not open** -> open tab + activate + expand content panel
2. **View open but not active tab** -> activate it (expand panel if collapsed)
3. **View open AND active AND panel expanded** -> collapse content panel

### Files Sidebar

Delegates to `layoutStore.setSecondarySidebarActiveView("files")` which already toggles (same view active -> collapse, otherwise -> expand + activate).

## File Changes

### 1. `src/renderer/src/features/content-panel/content-panel.ts`

Add `toggleView(viewType)` method to `ContentPanel` class:

```ts
toggleView(viewType: string): void {
  // Graceful no-op if viewType is not registered (e.g. plugin not loaded)
  const view = this.views.find((v) => v.viewType === viewType);
  if (!view) return;

  const store = this.store.getState();
  const existing = store.findTabByViewType(this.projectPath, viewType);

  if (!existing) {
    // Not open -> open it (openView already expands panel)
    this.openView(viewType);
    return;
  }

  const project = store.getProjectState(this.projectPath);
  const isActive = project.activeTabId === existing.id;

  if (isActive) {
    // Active -> toggle content panel visibility
    this.options.layout.togglePart(COLLAPSIBLE_WORKBENCH_PART.contentPanel);
  } else {
    // Open but not active -> activate + expand
    this.activateView(existing.id);
    this.options.layout.expandPart(COLLAPSIBLE_WORKBENCH_PART.contentPanel);
  }
}
```

Uses `this.options.layout` (IWorkbenchLayoutService) which ContentPanel already holds. `this.views` is already a private field. No new dependencies.

### 2. `src/renderer/src/lib/keybindings.ts`

- Add to `KeybindingAction` union: `"toggleChanges" | "toggleTerminal" | "toggleBrowser" | "toggleFiles"`
- Change `toggleMultiProject` default from `"Cmd+E"` to `"Cmd+Shift+E"`
- Add to `DEFAULT_KEYBINDINGS`:
  ```ts
  toggleChanges: "Cmd+E",
  toggleTerminal: "Cmd+J",
  toggleBrowser: "Cmd+Shift+B",
  toggleFiles: "Cmd+G",
  ```
- Add to `KEYBINDING_LABELS`:
  ```ts
  toggleChanges: "Toggle Changes",
  toggleTerminal: "Toggle Terminal",
  toggleBrowser: "Toggle Browser",
  toggleFiles: "Toggle Files",
  ```
- Add to `KEYBINDING_LABEL_KEYS`:
  ```ts
  toggleChanges: "settings.keybindings.toggleChanges",
  toggleTerminal: "settings.keybindings.toggleTerminal",
  toggleBrowser: "settings.keybindings.toggleBrowser",
  toggleFiles: "settings.keybindings.toggleFiles",
  ```
- Do NOT add to `READONLY_ACTIONS` (they are customizable)

### 3. `src/renderer/src/hooks/use-global-keybindings.ts`

- Import `useRendererApp` to access `app.workbench.contentPanel`
- Import `layoutStore` for files sidebar toggle
- Add 4 handlers in the keydown listener:

```ts
// Toggle Changes
if (matchesBinding(e, keybindings.toggleChanges)) {
  e.preventDefault();
  app.workbench.contentPanel.toggleView("changes");
  return;
}

// Toggle Terminal
if (matchesBinding(e, keybindings.toggleTerminal)) {
  e.preventDefault();
  app.workbench.contentPanel.toggleView("terminal");
  return;
}

// Toggle Browser
if (matchesBinding(e, keybindings.toggleBrowser)) {
  e.preventDefault();
  app.workbench.contentPanel.toggleView("browser");
  return;
}

// Toggle Files
if (matchesBinding(e, keybindings.toggleFiles)) {
  e.preventDefault();
  layoutStore.getState().setSecondarySidebarActiveView("files");
  return;
}
```

These should be placed **after** the `if (showSettings) return;` guard — panel toggles should not fire while settings is open.

### 4. `src/renderer/src/features/settings/components/panels/keybindings-panel.tsx`

Add to the `KEYBINDING_ACTIONS` array:

```ts
const KEYBINDING_ACTIONS: KeybindingAction[] = [
  "openSettings",
  "newChat",
  "toggleChanges", // new
  "toggleTerminal", // new
  "toggleBrowser", // new
  "toggleFiles", // new
  "toggleMultiProject", // was missing from UI
  "prevSession",
  "nextSession",
  "copyPath",
  "closeSettings",
  "toggleTheme",
  "clearTerminal",
];
```

### 5. i18n Locale Files

**`src/renderer/src/locales/en-US.json`** — add after line 116:

```json
"settings.keybindings.toggleChanges": "Toggle Changes",
"settings.keybindings.toggleTerminal": "Toggle Terminal",
"settings.keybindings.toggleBrowser": "Toggle Browser",
"settings.keybindings.toggleFiles": "Toggle Files",
```

**`src/renderer/src/locales/zh-CN.json`** — add after line 116:

```json
"settings.keybindings.toggleChanges": "切换变更面板",
"settings.keybindings.toggleTerminal": "切换终端",
"settings.keybindings.toggleBrowser": "切换浏览器",
"settings.keybindings.toggleFiles": "切换文件"
```

### 6. `src/shared/features/config/types.ts` (verify during implementation)

If the `keybindings` field in the config type references `KeybindingAction`, adding new values to the union in `keybindings.ts` should auto-resolve. Verify this during implementation — if the config type defines its own keybinding key set independently, it needs updating too.

## Notes

- `Cmd+E` is freed from `toggleMultiProject` and reassigned to `toggleChanges`. Users with custom bindings keep theirs (persisted as overrides).
- `Cmd+G` conflicts with browser "Find next" but this is an Electron app, not a browser.
- `Cmd+J` matches VS Code's "toggle terminal" convention.
- Content panel view types: `"changes"`, `"terminal"`, `"browser"` — registered by their respective plugins.
- Files view type `"files"` — registered as a secondary sidebar view by the files plugin.
