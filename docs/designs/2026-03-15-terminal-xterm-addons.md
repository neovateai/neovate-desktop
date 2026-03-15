# Terminal xterm Addon Improvements

## Summary

Add missing xterm addons, fix misplaced dependencies, and add a WebGL fallback renderer to the terminal plugin.

## Current State

**Addons used in `terminal-view.tsx`:**

- `@xterm/addon-fit` — auto-fit terminal to container
- `@xterm/addon-web-links` — clickable URLs (Cmd/Ctrl+click)
- `@xterm/addon-webgl` — GPU-accelerated rendering

**Key finding:** `deactivation: "offscreen"` keeps the terminal component mounted (moved off-screen via CSS). The PTY and xterm instance survive tab switches. Session restore via `@xterm/addon-serialize` is unnecessary.

## Changes

### 1. Fix: Move `@xterm/addon-web-links` to desktop package

`terminal-view.tsx` imports `@xterm/addon-web-links`, but the dependency is only in the root `package.json`, not `packages/desktop/package.json`. Works via workspace hoisting but is fragile.

**Files:**

- `package.json` — remove `@xterm/addon-web-links` from devDependencies
- `packages/desktop/package.json` — add `@xterm/addon-web-links` to devDependencies

### 2. Fix: Remove orphaned `@xterm/addon-serialize`

`@xterm/addon-serialize` is in root `package.json` but never imported anywhere.

**Files:**

- `package.json` — remove `@xterm/addon-serialize` from devDependencies

### 3. Feature: Keyboard search (Cmd+F)

Add `@xterm/addon-search` with a minimal floating input.

**UX:**

- `Cmd+F` (Mac) / `Ctrl+F` (Win/Linux) — show a small `<input>` absolutely positioned at top-right of the terminal container
- Incremental search: each keystroke calls `findNext()` with ~50ms debounce to avoid lag on fast typing
- Case-insensitive by default (`{ caseSensitive: false }`) — matches user expectations from browser Cmd+F
- Minimal match count label (`"3 of 17"`) displayed next to the input via `onDidChangeResults` callback
- `Enter` — next match, `Shift+Enter` — previous match
- `Escape` — clear highlights, hide input, call `xtermRef.current.focus()` to return keyboard input to terminal
- When `resultCount` is 0, show `"No results"` instead of `"0 of 0"`
- No buttons, no regex toggle

**Electron Cmd+F conflict:**
Electron captures `Cmd+F` for its built-in find-in-page by default. The terminal's `attachCustomKeyEventHandler` runs inside xterm's DOM, but Electron's accelerator fires first. Must disable the built-in find-in-page for the terminal webContents or handle at the Electron menu/accelerator level. Verify this works during implementation — potential blocker.

**Implementation:**

- Add `useState` for `searchVisible` and `searchQuery`
- Add `useRef` for `SearchAddon` and the search `<input>` element
- Intercept `Cmd+F` in the existing `attachCustomKeyEventHandler` (alongside existing `Cmd+K`), then call `inputRef.current?.focus()` to focus the search input
- Debounce the `findNext()` call (~50ms) — not the input onChange itself
- Subscribe to `searchAddon.onDidChangeResults` to update a `"X of Y"` / `"No results"` label
- Dispose `onDidChangeResults` subscription and SearchAddon in the cleanup `return () => { ... }` block
- Wrap return JSX in a `relative` container to position the search input + match count span
- Style the input to match terminal theme (dark/light aware via `resolvedTheme`)

**Files:**

- `packages/desktop/package.json` — add `@xterm/addon-search`
- `terminal-view.tsx` — import SearchAddon, add search state/UI/keyboard handling

### 4. Feature: Unicode 11 support

Add `@xterm/addon-unicode11` for correct CJK character and emoji width calculation.

```tsx
import { Unicode11Addon } from "@xterm/addon-unicode11";

xterm.loadAddon(new Unicode11Addon());
xterm.unicode.activeVersion = "11";
```

**Files:**

- `packages/desktop/package.json` — add `@xterm/addon-unicode11`
- `terminal-view.tsx` — import and activate Unicode11Addon

## File Change Summary

| File                                                                   | Changes                                                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `package.json` (root)                                                  | Remove `@xterm/addon-web-links`, remove `@xterm/addon-serialize`                                                        |
| `packages/desktop/package.json`                                        | Add `@xterm/addon-web-links`, `@xterm/addon-search`, `@xterm/addon-unicode11`                                           |
| `packages/desktop/src/renderer/src/plugins/terminal/terminal-view.tsx` | `allowProposedApi: true`, search UI + keyboard handling + debounce + match count, unicode11, re-fit on tab reactivation |

### 5. Fix: Re-fit terminal on tab reactivation

When the terminal returns from offscreen (`-left-[9999em]` to `left-0`), the xterm canvas may need a re-fit. The `ResizeObserver` only fires if container dimensions change — if the size is identical, it won't trigger.

Use `useContentPanelViewContext().isActive` to detect tab reactivation and call `fitAddon.fit()`:

```tsx
const { isActive } = useContentPanelViewContext();

useEffect(() => {
  if (isActive && fitAddonRef.current) {
    // Wait for browser layout pass after CSS position change
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
    });
  }
}, [isActive]);
```

**Files:**

- `terminal-view.tsx` — import `useContentPanelViewContext`, add `isActive` effect

### 6. Fix: Enable `allowProposedApi` in Terminal constructor

Both `SearchAddon.onDidChangeResults` and `Unicode11Addon` (`xterm.unicode.activeVersion`) use xterm's proposed API. Without `allowProposedApi: true`, the Terminal throws at runtime and crashes the `<TerminalView>` component.

```tsx
const xterm = new Terminal({
  allowProposedApi: true,
  // ...
});
```

## Decisions Made

- **Serialize dropped**: `deactivation: "offscreen"` keeps the component mounted — PTY survives tab switches already
- **Canvas addon dropped**: No stable release for xterm 6.x — only beta versions with peer dep mismatches
- **Search UI**: Minimal floating input with match count label, keyboard-only (no buttons/regex toggle), case-insensitive default, 50ms debounced incremental search
- **Image addon**: Out of scope
- **Ligatures addon**: Out of scope
