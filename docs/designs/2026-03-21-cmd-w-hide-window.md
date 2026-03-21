# Cmd+W Hides Window on macOS

## 1. Background

On macOS, the standard convention for single-window apps is that Cmd+W hides the window rather than destroying it. Currently, Cmd+W destroys the BrowserWindow, so clicking the dock icon creates a brand new window (slow, loses transient state). The desired behavior is to hide the window and instantly show it again on dock click.

## 2. Decision Log

**1. Where to intercept Cmd+W?**

- Options: A) Intercept `close` event on BrowserWindow · B) Replace menu role with custom handler · C) Use globalShortcut
- Decision: **A) Intercept `close` event** — Standard Electron pattern. Catches Cmd+W, traffic light close button, and programmatic close in one place.

**2. How to allow actual quit (Cmd+Q)?**

- Options: A) Track `isQuitting` flag via `before-quit` event · B) Call `win.destroy()` directly
- Decision: **A) `isQuitting` flag** — Standard pattern. `before-quit` fires before `close`, so the flag is set in time.

**3. Where to put the flag?**

- Options: A) `BrowserWindowManager` class field · B) Module-level in index.ts · C) Inline closure
- Decision: **A) Class field** — Clean encapsulation; the manager owns window lifecycle.

**4. macOS only or all platforms?**

- Options: A) macOS only · B) All platforms
- Decision: **A) macOS only** — Hide-on-close is a macOS convention. Windows/Linux users expect close to close.

## 3. Design

Modify `BrowserWindowManager.createMainWindow()`:

1. Add `#isQuitting = false` private field
2. Listen to `app.on("before-quit")` to set the flag to `true`
3. Modify the existing `close` event handler: after saving window state, on macOS when not quitting, call `e.preventDefault()` and `win.hide()`

Key lifecycle interactions:

- **Cmd+W**: `close` fires → state saved → `preventDefault()` + `hide()` → window stays in memory
- **Cmd+Q**: `before-quit` fires (sets flag) → `close` fires → state saved → window destroyed → app quits
- **Dock click**: `activate` fires → existing `win.show()` branch runs (instant)
- **Auto-update**: `quitAndInstall()` calls `app.quit()` → `before-quit` fires → flag set → works correctly

## 4. Files Changed

- `packages/desktop/src/main/core/browser-window-manager.ts` — Add `#isQuitting` flag, import `app`, intercept `close` to hide on macOS

## 5. Verification

1. Cmd+W hides the window (disappears from screen, stays in dock)
2. Clicking dock icon shows the window instantly
3. Cmd+Q quits the app normally
4. Window position/size is restored correctly after hide+show
5. Traffic light close button (red) also hides instead of closing
6. Windows/Linux behavior unchanged (Ctrl+W closes normally)
