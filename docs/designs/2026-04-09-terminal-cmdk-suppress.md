# Suppress Cmd+K Command Palette When Terminal Is Focused

**Date:** 2026-04-09

## Problem

Pressing Cmd+K while the terminal panel is focused opens the command palette. It should only clear the terminal.

## Root Cause

xterm's `attachCustomKeyEventHandler` returning `false` only prevents xterm from processing the key — the native DOM `KeyboardEvent` still bubbles to `window`, where `use-global-keybindings.ts` catches it and calls `useCommandPaletteStore.getState().toggle()`.

## Approach: `stopPropagation` in xterm's key handler

Call `event.stopPropagation()` once at the bottom for all handled shortcuts, so any future terminal shortcut is automatically shielded from the global handler without remembering to add the call each time.

**Why this over alternatives:**

- Checking focused element in the global handler is fragile (relies on xterm DOM class names, couples global bindings to terminal internals).
- A separate capture-phase listener duplicates shortcut-matching logic for no benefit.
- `stopPropagation` is the standard DOM mechanism for exactly this scenario.

## Changes

**File:** `src/renderer/src/plugins/terminal/terminal-view.tsx` (lines 229-242)

```diff
 xterm.attachCustomKeyEventHandler((event) => {
   const modifier = isMac ? event.metaKey : event.ctrlKey;
   if (event.type !== "keydown" || !modifier) return true;
   if (event.key === "k") {
     xterm.clear();
-    return false;
-  }
-  if (event.key === "f") {
+  } else if (event.key === "f") {
     setSearchVisible(true);
     requestAnimationFrame(() => searchInputRef.current?.focus());
-    return false;
+  } else {
+    return true;
   }
-  return true;
+  event.stopPropagation();
+  return false;
 });
```

No other files need changes.
