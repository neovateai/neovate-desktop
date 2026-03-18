# Window State Persistence

## Decision Log

**1. What needs to change?**

- Options: A) Everything from scratch · B) Only fill gaps in existing persistence · C) Move layout to electron-store too
- Decision: **B) Only fill gaps** — Window bounds (x/y/width/height) are already persisted in `window-state.json`. Layout panels (width/collapsed/activeView) are already persisted via localStorage. The only gaps are: maximized/fullscreen state, and off-screen bounds validation.

**2. Where to persist maximized/fullscreen state?**

- Options: A) Alongside bounds in `window-state.json` · B) In `config.json` · C) In `state.json`
- Decision: **A) `window-state.json`** — It already stores window bounds, window display state belongs here.

**3. Should layout panels move from localStorage to electron-store?**

- Options: A) Move to electron-store via IPC · B) Keep in localStorage
- Decision: **B) Keep in localStorage** — Already working with validation (`mergePersisted`), more performant (no IPC per resize), localStorage reliable in Electron.

**4. Off-screen validation strategy?**

- Options: A) Check if saved position intersects any display · B) Center on primary display · C) No validation
- Decision: **A) Intersect check** — Use Electron screen API to verify window would be partially visible. If not, drop position and let Electron center it.

**5. When to save window state?**

- Options: A) On close only · B) On resize/move events · C) Periodically
- Decision: **A) On close only** — Current behavior, simple and sufficient.

## Changes

### `src/main/core/browser-window-manager.ts`

- Extend `WindowStore` to include `isMaximized` and `isFullScreen`
- On close: save `isMaximized()`, `isFullScreen()`, and `getNormalBounds()`
- On create: validate saved bounds are on visible display, restore maximized/fullscreen after show
- Add `#isVisibleOnAnyDisplay(bounds)` helper

### No other files change

- Layout panel persistence via localStorage already works (Zustand persist + `mergePersisted` validation)
- No IPC contract changes needed
