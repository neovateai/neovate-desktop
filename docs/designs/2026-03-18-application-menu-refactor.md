# Application Menu Refactor

## Goal

Refactor the application menu from a plain function (`setupApplicationMenu`) into an `ApplicationMenu` class that:

1. Capitalizes the "About" label properly (`About Neovate` instead of lowercase)
2. Adds a dynamic "Check for Updates" menu item with live state feedback
3. Follows VS Code's pattern for menu ↔ service interaction via interface injection
4. Handles Electron's immutable MenuItem limitation with safe menu rebuilds

## Architecture

### Dependency Direction

```
ApplicationMenu  →  IUpdateService (interface, in shared/)
                         ↑
                    UpdaterService (implements, in main/)
```

- `ApplicationMenu` depends on `IUpdateService` interface — never the concrete class
- `UpdaterService` implements `IUpdateService` — knows nothing about the menu
- `index.ts` (assembly layer) wires them together: `new ApplicationMenu(updaterService)`
- Interface defined in `shared/features/updater/types.ts` alongside `UpdaterState`

This matches VS Code's `Menubar` → `IUpdateService` pattern: the menu imports a lightweight interface from the update module, not the implementation.

### Multi-Window Support

`ApplicationMenu` holds no window reference. Per-window actions (e.g. open settings) resolve via `BrowserWindow.getFocusedWindow()` at click time. Future plugin windows work without menu changes.

### Future: Data-Driven Menus

Currently menu items are hardcoded in `build()`. To support plugin-contributed menu items, the evolution path is:

1. Extract hardcoded template into a menu data structure
2. `build()` renders from data instead of inline templates
3. Expose `registerMenuItems(section, items)` for plugins

The class-based design with centralized `build()` already supports this — no structural changes needed.

## Interface

### `IUpdateService` (`shared/features/updater/types.ts`)

```ts
export interface IUpdateService {
  readonly state: UpdaterState;
  onStateChange(cb: (state: UpdaterState) => void): () => void;
  check(manual?: boolean): void;
  install(): void;
}
```

## Implementation

### `ApplicationMenu` (`main/core/menu.ts`)

Class with the following lifecycle:

| Concern            | Implementation                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction       | Subscribes to `IUpdateService.onStateChange`, registers `before-quit` listener, calls `build()`                                                          |
| Rebuild scheduling | Debounced via `setTimeout(0)` + 10ms delay to avoid rebuilding while menu is open (same approach as VS Code)                                             |
| Old menu GC        | Retains references to replaced `Menu` objects for 10s to prevent Electron GC crash ([electron#55347](https://github.com/electron/electron/issues/55347)) |
| Disposal           | Unsubscribes from update service, removes `before-quit` listener, clears all timers                                                                      |

### Update Menu Item States

| `UpdaterState.status`           | Label                 | Enabled | Click Action                |
| ------------------------------- | --------------------- | ------- | --------------------------- |
| `idle` / `up-to-date` / `error` | Check for Updates     | yes     | `updateService.check(true)` |
| `checking`                      | Checking for Updates… | no      | —                           |
| `downloading`                   | Downloading Update…   | no      | —                           |
| `ready`                         | Restart to Update     | yes     | `updateService.install()`   |

### `UpdaterService` Changes (`main/features/updater/service.ts`)

- `implements IUpdateService`
- Renamed internal `state` → `_state` (private), exposed via `get state()` getter
- Added `onStateChange(cb)`: thin wrapper over existing `publisher.subscribe("state", cb)`, returns unsubscribe function

### `index.ts` Changes

```ts
// Before
setupApplicationMenu(mainApp.windowManager.mainWindow, {
  onCheckForUpdates: () => updaterService.check(true),
});

// After
const menu = new ApplicationMenu(updaterService);

// Cleanup
app.on("before-quit", () => {
  menu.dispose();
});
```

## Files Changed

| File                                   | Change                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/shared/features/updater/types.ts` | Added `IUpdateService` interface                                                             |
| `src/main/features/updater/service.ts` | `implements IUpdateService`, added `onStateChange()`, renamed `state` → `_state` with getter |
| `src/main/core/menu.ts`                | Replaced `setupApplicationMenu` function with `ApplicationMenu` class                        |
| `src/main/index.ts`                    | Simplified to `new ApplicationMenu(updaterService)`, added `menu.dispose()`                  |
