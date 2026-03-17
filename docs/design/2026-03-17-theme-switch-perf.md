# Theme Switching Performance Fix

## Problem

Switching themes feels very laggy. Three root causes identified:

1. **`transition-colors` animation** — Many elements have Tailwind's `transition-colors` (150ms default). When `.dark` class toggles, CSS variables change and all these elements animate the color shift instead of switching instantly.
2. **`ThemeSync` indirection** — Theme change flows through zustand state -> React render -> useEffect -> next-themes `setTheme()`, adding 1-2 frame delay before the DOM actually updates.
3. **`GeneralPanel` subscribes to entire store** — `useConfigStore()` without selector causes unnecessary re-renders on any config change.

## Fix #1: `disableTransitionOnChange`

**File:** `src/renderer/src/core/app.tsx` (lines 244, 274)

Add `disableTransitionOnChange` prop to both `ThemeProvider` instances:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

next-themes injects a temporary `* { transition: none !important }` style during theme switch, then removes it. All color changes become instant.

## Fix #2: Direct `setTheme` in `GeneralPanel`

**File:** `src/renderer/src/features/settings/components/panels/general-panel.tsx`

Import `useTheme` from `next-themes`. In `handleThemeChange`, call `setTheme()` first for instant DOM update, then `setConfig()` for persistence:

```tsx
const { setTheme } = useTheme();

const handleThemeChange = (newTheme: string) => {
  if (newTheme === config.theme) return;
  setTheme(newTheme); // instant DOM
  setConfig("theme", newTheme as any); // persist + zustand
};
```

`ThemeSync` in `app.tsx` is updated to only fire on initial load (see Fix #2b).

## Fix #2b: Guard `ThemeSync` to initial load only

**File:** `src/renderer/src/core/app.tsx`

After fix #2, every theme change calls `setTheme()` twice — once directly in the handler, once via `ThemeSync` useEffect (because zustand state changed). Guard `ThemeSync` with a ref so it only syncs once on initial load:

```tsx
function ThemeSync() {
  const configTheme = useConfigStore((s) => s.theme);
  const loaded = useConfigStore((s) => s.loaded);
  const { setTheme } = useTheme();
  const synced = useRef(false);

  useEffect(() => {
    if (loaded && !synced.current) {
      synced.current = true;
      setTheme(configTheme);
    }
  }, [configTheme, loaded, setTheme]);

  return null;
}
```

## Fix #3: `useShallow` selectors in `GeneralPanel`

**File:** `src/renderer/src/features/settings/components/panels/general-panel.tsx`

Replace `const config = useConfigStore()` with `useShallow` to pick only needed fields:

```tsx
import { useShallow } from "zustand/react/shallow";

const {
  theme,
  locale,
  runOnStartup,
  multiProjectSupport,
  terminalFontSize,
  terminalFont,
  developerMode,
} = useConfigStore(
  useShallow((s) => ({
    theme: s.theme,
    locale: s.locale,
    runOnStartup: s.runOnStartup,
    multiProjectSupport: s.multiProjectSupport,
    terminalFontSize: s.terminalFontSize,
    terminalFont: s.terminalFont,
    developerMode: s.developerMode,
  })),
);
```

Update all `config.xxx` references in JSX to use the destructured variables. Component now only re-renders when a picked field changes.

## Fix #4: Remove stale theme convenience hooks

**File:** `src/renderer/src/features/config/store.ts`

Remove `useTheme` and `useSetTheme` exports (lines 94-99):

```tsx
// DELETE these:
export const useTheme = () => useConfigStore((s) => s.theme);
export const useSetTheme = () => (value: AppConfig["theme"]) =>
  useConfigStore.getState().setConfig("theme", value);
```

After fix #2b, `ThemeSync` no longer reacts to zustand theme changes. This makes `useSetTheme` a trap — it persists the theme but never applies it visually. And `useTheme` from the store shadows `useTheme` from `next-themes`, causing confusion. Neither is imported anywhere in the codebase.

## Changes Summary

| File                | Change                                                         | Lines |
| ------------------- | -------------------------------------------------------------- | ----- |
| `app.tsx`           | Add `disableTransitionOnChange` to 2 ThemeProviders            | ~2    |
| `app.tsx`           | Guard `ThemeSync` with ref for initial-load-only sync          | ~5    |
| `general-panel.tsx` | Import `useTheme`, direct `setTheme()`, `useShallow` selectors | ~15   |
| `config/store.ts`   | Remove stale `useTheme` and `useSetTheme` exports              | ~4    |
