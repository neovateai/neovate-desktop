# Quit Confirmation Dialog

## Summary

Show a native OS confirmation dialog every time the user attempts to quit Neovate Desktop.

## Behavior

- Intercept **every** quit attempt (`before-quit` event on macOS, `close` event on Windows/Linux)
- Show a **native OS dialog** (`dialog.showMessageBox`) attached to the main window
- If user confirms: proceed with quit
- If user cancels: `preventDefault()`, abort quit

## Dialog Content

- **Title:** "Quit Neovate Desktop?"
- **Body:** "Any running sessions will be interrupted."
- **Buttons:** "Cancel" / "Quit Anyway"
- **Default button:** Cancel (safe default)

## Implementation

Primary location: `src/main/core/browser-window-manager.ts`

- Add a `#quitConfirmed` flag (starts `false`)
- **macOS**: intercept in `before-quit` — `preventDefault()`, show native dialog async, if confirmed set `#quitConfirmed = true` and call `app.quit()` again. This works because close-to-hide keeps the window alive.
- **Windows/Linux**: intercept in the main window `close` event — the window is still available at this point. `before-quit` is too late on these platforms because the window may already be closing and unavailable for `showMessageBox`.
- Reset `#quitConfirmed` to `false` after the dialog is cancelled, so the next quit attempt shows it again.

### Event ordering

`before-quit` is synchronous — you can `preventDefault()` but cannot `await` inside it. The pattern is: prevent, show dialog async, then re-quit on confirm.

`index.ts:169` has a `before-quit` listener that runs cleanup (`sessionManager.closeAll()`, `mainApp.stop()`). The confirmation listener must fire **before** cleanup. Either:

- Register the confirmation listener before the cleanup listener (Electron fires in registration order), or
- Move cleanup to `will-quit` (which only fires after `before-quit` succeeds)

### Auto-update bypass

The updater service calls `autoUpdater.quitAndInstall()` which triggers `before-quit`. Showing a confirmation dialog after the user just clicked "Restart to Update" is wrong. Before calling `quitAndInstall()`, set `#quitConfirmed = true` to bypass the dialog. This requires the updater service to have a reference to the window manager, or a shared `skipQuitConfirmation()` method.

## Edge Cases

- **macOS hidden window**: On macOS, closing the window hides it. If the user quits via Dock right-click → Quit, the window is hidden. Call `win.show()` before `showMessageBox`, or call `dialog.showMessageBox()` without a parent window to show a standalone OS dialog.
- **Re-entrancy guard**: If the user hits Cmd+Q twice before the dialog resolves, two dialogs would stack. Add a `#showingDialog` flag — if already showing, just `preventDefault()` and return without opening another.
- **Multiple rapid quit attempts**: the `#quitConfirmed` flag prevents re-showing the dialog on the second `app.quit()` call after confirmation.
- **Window unavailable**: on Windows/Linux, intercepting at `close` ensures the window is always available for the dialog.
