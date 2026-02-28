# next-themes Light/Dark Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up `next-themes` to manage light/dark theme switching in the Electron renderer, with a floating toggle button in the app header.

**Architecture:** Install `next-themes`, wrap the React root with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`, and add a `ThemeToggle` button to the app header. The existing `.dark` class CSS variable system requires zero changes — next-themes manages the class on `document.documentElement`.

**Tech Stack:** next-themes, React 19, Tailwind CSS v4, @hugeicons/react, Vitest (no component test infra available — verify visually with electron-pilot)

---

### Task 1: Install next-themes

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Install the package**

```bash
cd apps/desktop && bun add next-themes
```

Expected: `next-themes` appears in `dependencies` in `apps/desktop/package.json`.

**Step 2: Verify install**

```bash
bun run typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add apps/desktop/package.json apps/desktop/bun.lock
git commit -m "feat: install next-themes"
```

---

### Task 2: Wrap React root with ThemeProvider

**Files:**
- Modify: `apps/desktop/src/renderer/src/main.tsx`

**Context:** `main.tsx` currently renders:
```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 1: Update main.tsx**

Replace the contents of `apps/desktop/src/renderer/src/main.tsx` with:

```tsx
import "./assets/main.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
```

- `attribute="class"` — next-themes toggles the `.dark` class on `document.documentElement`, matching the existing CSS variable system
- `defaultTheme="system"` — follows OS preference on first launch
- `enableSystem` — keeps in sync with OS theme changes

**Step 2: Typecheck**

```bash
cd apps/desktop && bun run typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/main.tsx
git commit -m "feat: wrap React root with next-themes ThemeProvider"
```

---

### Task 3: Create ThemeToggle component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/theme-toggle.tsx`

**Context:**
- Use `useTheme()` from `next-themes` to get `resolvedTheme` and `setTheme`
- Use `resolvedTheme` (not `theme`) because when `theme="system"`, `resolvedTheme` gives the actual applied value (`"light"` or `"dark"`)
- Icons: `Sun01Icon` (show when dark → click to go light) and `Moon01Icon` (show when light → click to go dark) from `@hugeicons/react`
- Styling: `ghost` variant `icon-sm` size button from the existing Button component — but import only what you need; ThemeToggle is simple enough to use a plain `<button>` with `cn()` directly

**Step 1: Create the component**

Create `apps/desktop/src/renderer/src/components/ui/theme-toggle.tsx`:

```tsx
import { Moon01Icon, Sun01Icon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { cn } from "../../lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      className={cn(
        "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-transparent text-foreground transition-colors hover:bg-accent sm:size-7",
        className,
      )}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? (
        <Sun01Icon className="size-4 opacity-80" />
      ) : (
        <Moon01Icon className="size-4 opacity-80" />
      )}
    </button>
  );
}
```

**Step 2: Typecheck**

```bash
cd apps/desktop && bun run typecheck
```

Expected: No errors. If `Sun01Icon` or `Moon01Icon` are not found, check available icon names:

```bash
bunx -e "import * as icons from '@hugeicons/react'; console.log(Object.keys(icons).filter(k => /sun|moon/i.test(k)).slice(0, 20))"
```

Use the correct icon name from the output (look for `Sun01Icon`, `SunIcon`, `Moon01Icon`, `MoonIcon`, etc.).

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/theme-toggle.tsx
git commit -m "feat: add ThemeToggle component"
```

---

### Task 4: Mount ThemeToggle in App header

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

**Context:** Current `App.tsx` header:
```tsx
<header className="flex items-center border-b border-border px-4 py-2">
  <h1 data-testid="app-title" className="text-sm font-semibold">
    Neovate Desktop
  </h1>
</header>
```

**Step 1: Update App.tsx**

```tsx
import { AgentChat } from "./features/acp";
import { ThemeToggle } from "./components/ui/theme-toggle";

export default function App() {
  return (
    <div data-testid="app-root" className="flex h-screen flex-col">
      <header className="flex items-center border-b border-border px-4 py-2">
        <h1 data-testid="app-title" className="text-sm font-semibold">
          Neovate Desktop
        </h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <AgentChat />
      </main>
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
cd apps/desktop && bun run typecheck
```

Expected: No errors.

**Step 3: Run unit tests to confirm nothing broken**

```bash
cd apps/desktop && bun run test:run
```

Expected: All existing tests pass.

**Step 4: Visual verification**

Use the `electron-pilot` skill to launch the app and verify:
- The app renders correctly in the default OS theme
- The toggle button appears in the header (right side)
- Clicking the button switches between light and dark
- Refreshing the app restores the last selected theme (localStorage persistence)
- If OS theme changes, the `system` default is respected on first launch

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx
git commit -m "feat: mount ThemeToggle in app header"
```
