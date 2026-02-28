# Design: Light/Dark Theme with next-themes

**Date:** 2026-02-28
**Status:** Approved

## Summary

Add light/dark theme support to the Neovate Desktop Electron app using `next-themes`. The app already has a complete CSS variable system with `.dark` class-based theming — this design wires it up with a proper React provider and a floating toggle button.

## Architecture

Install `next-themes` as a production dependency. Wrap the React root in `<ThemeProvider>` inside `main.tsx` with:

- `attribute="class"` — toggles `.dark` on `document.documentElement`, matching the existing CSS
- `defaultTheme="system"` — follows OS preference on first launch
- `enableSystem` — keeps in sync with OS changes

No CSS changes required. No IPC or Zustand involvement — next-themes owns theme state entirely.

## Components

A single new `ThemeToggle` component:

- Positioned `fixed top-4 right-4 z-50` as a floating button
- Uses `useTheme()` to read `resolvedTheme` and `setTheme()`
- Shows sun icon when dark (click → light), moon icon when light (click → dark)
- Icons sourced from the existing `@hugeicons/react` library
- Styled with existing CVA button variants
- Mounted directly in `App.tsx`

## Data Flow

1. App starts → next-themes reads `localStorage` for saved preference, falls back to `prefers-color-scheme`
2. next-themes applies/removes `.dark` on `document.documentElement`
3. `ThemeToggle` reads `resolvedTheme` to show the correct icon
4. User clicks toggle → `setTheme()` updates state, `localStorage`, and DOM class atomically

## Persistence

`localStorage` via next-themes' built-in handling. An inline script injected before React renders prevents flash of incorrect theme on startup.

## Files Changed

- `package.json` — add `next-themes`
- `src/renderer/src/main.tsx` — wrap root with `<ThemeProvider>`
- `src/renderer/src/components/ui/theme-toggle.tsx` — new component
- `src/renderer/src/App.tsx` — mount `<ThemeToggle>`
