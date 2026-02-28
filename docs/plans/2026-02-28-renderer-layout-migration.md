# Renderer Layout Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-panel layout (primary sidebar, chat, content panel, secondary sidebar, activity bar, title bars, status bar) from scratch in neovate-desktop, inspired by neovate-code-desktop's layout.

**Architecture:** Zustand store manages panel visibility state (`Record<string, PanelState>`). Layout components are thin wrappers using Tailwind + `motion` for animated show/hide. Structural divs are inlined in App.tsx (no wrapper components for simple flex containers). AgentChat stays as-is in the chat panel. All other panels get placeholder content.

**Tech Stack:** React 19, Tailwind CSS 4, Zustand, motion (Framer Motion), Lucide icons, existing `cn()` utility

---

### Task 1: Install motion dependency

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Install motion**

Run: `cd apps/desktop && bun add motion`

**Step 2: Verify installation**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/package.json bun.lock
git commit -m "deps: add motion library for layout animations"
```

---

### Task 2: Create layout Zustand store

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/use-layout-store.ts`

**Step 1: Write the store**

```ts
import { create } from "zustand"

type PanelState = {
  collapsed: boolean
}

type LayoutStore = {
  panels: Record<string, PanelState>
  togglePanel: (id: string) => void
}

const DEFAULT_PANELS: Record<string, PanelState> = {
  primarySidebar: { collapsed: false },
  contentPanel: { collapsed: true },
  secondarySidebar: { collapsed: true },
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  panels: DEFAULT_PANELS,
  togglePanel: (id) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [id]: { ...state.panels[id], collapsed: !state.panels[id]?.collapsed },
      },
    })),
}))
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/use-layout-store.ts
git commit -m "feat: add layout Zustand store for panel visibility"
```

---

### Task 3: Create layout container components

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/app-layout.tsx`

This file contains the root layout and panel slot components. Only components that have logic (animation, state reads) are componentized. Simple structural divs are left to App.tsx.

**Step 1: Write the layout components**

Panels are always mounted (never conditionally rendered) to preserve internal state. Animation clips content via `overflow: hidden` on the motion container while an inner div maintains fixed width.

```tsx
import { type ReactNode } from "react"
import { motion } from "motion/react"
import { useLayoutStore } from "./use-layout-store"

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 }

export function AppLayoutRoot({ children }: { children: ReactNode }) {
  return (
    <div data-slot="app-layout-root" className="flex h-screen w-screen overflow-hidden p-2">
      {children}
    </div>
  )
}

export function AppLayoutPrimarySidebar({ children }: { children: ReactNode }) {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed)

  return (
    <motion.aside
      data-slot="primary-sidebar"
      className="h-full shrink-0 overflow-hidden rounded-lg bg-card"
      animate={{ width: collapsed ? 0 : 300 }}
      transition={SPRING}
    >
      <div className="h-full w-[300px]">{children}</div>
    </motion.aside>
  )
}

export function AppLayoutTitleBar({ children }: { children: ReactNode }) {
  return (
    <div data-slot="titlebar" className="flex h-10 shrink-0 items-center">
      {children}
    </div>
  )
}

export function AppLayoutChatPanel({ children }: { children: ReactNode }) {
  return (
    <div data-slot="chat-panel" className="min-w-[320px] flex-1 overflow-hidden rounded-lg bg-card">
      {children}
    </div>
  )
}

export function AppLayoutContentPanel({ children }: { children: ReactNode }) {
  const collapsed = useLayoutStore((s) => s.panels.contentPanel?.collapsed)

  return (
    <motion.div
      data-slot="content-panel"
      className="h-full shrink-0 overflow-hidden rounded-lg bg-card"
      animate={{ width: collapsed ? 0 : 300 }}
      transition={SPRING}
    >
      <div className="h-full w-[300px]">{children}</div>
    </motion.div>
  )
}

export function AppLayoutSecondarySidebar({ children }: { children: ReactNode }) {
  const collapsed = useLayoutStore((s) => s.panels.secondarySidebar?.collapsed)

  return (
    <motion.aside
      data-slot="secondary-sidebar"
      className="h-full shrink-0 overflow-hidden rounded-lg bg-card"
      animate={{ width: collapsed ? 0 : 240 }}
      transition={SPRING}
    >
      <div className="h-full w-[240px]">{children}</div>
    </motion.aside>
  )
}

export function AppLayoutActivityBar({ children }: { children: ReactNode }) {
  return (
    <div data-slot="activity-bar" className="flex h-full w-12 shrink-0 flex-col">
      {children}
    </div>
  )
}
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/app-layout.tsx
git commit -m "feat: add layout container components with motion animations"
```

---

### Task 4: Create traffic lights spacer

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/traffic-lights.tsx`

**Step 1: Write the component**

macOS window controls need a spacer so content doesn't overlap them. Includes a sidebar toggle button.

```tsx
import { PanelLeft } from "lucide-react"
import { useLayoutStore } from "./use-layout-store"

export function TrafficLightsSection() {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed)
  const togglePanel = useLayoutStore((s) => s.togglePanel)

  return (
    <div data-slot="traffic-lights" className="flex w-[76px] shrink-0 items-center justify-end pr-1">
      <button
        type="button"
        onClick={() => togglePanel("primarySidebar")}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
      >
        <PanelLeft className="h-4 w-4" />
      </button>
    </div>
  )
}
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/traffic-lights.tsx
git commit -m "feat: add traffic lights spacer with sidebar toggle"
```

---

### Task 5: Create title bar components

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/primary-titlebar.tsx`
- Create: `apps/desktop/src/renderer/src/components/layout/secondary-titlebar.tsx`

**Step 1: Write primary title bar**

```tsx
export function PrimaryTitleBar() {
  return (
    <div
      data-slot="primary-titlebar"
      className="flex flex-1 items-center px-3"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="text-xs font-medium text-muted-foreground" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        Neovate Desktop
      </span>
    </div>
  )
}
```

**Step 2: Write secondary title bar**

```tsx
import { Settings } from "lucide-react"

export function SecondaryTitleBar() {
  return (
    <div
      data-slot="secondary-titlebar"
      className="flex shrink-0 items-center gap-1 px-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  )
}
```

**Step 3: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/primary-titlebar.tsx apps/desktop/src/renderer/src/components/layout/secondary-titlebar.tsx
git commit -m "feat: add primary and secondary title bar components"
```

---

### Task 6: Create activity bar

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/activity-bar.tsx`

**Step 1: Write the activity bar**

```tsx
import { Files, GitBranch, Search, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLayoutStore } from "./use-layout-store"

type ActivityBarItemProps = {
  icon: React.ReactNode
  label: string
  panelId: string
}

function ActivityBarItem({ icon, label, panelId }: ActivityBarItemProps) {
  const collapsed = useLayoutStore((s) => s.panels[panelId]?.collapsed)
  const togglePanel = useLayoutStore((s) => s.togglePanel)

  return (
    <button
      type="button"
      onClick={() => togglePanel(panelId)}
      className={cn(
        "flex h-10 w-full items-center justify-center text-muted-foreground hover:text-foreground",
        !collapsed && "text-foreground",
      )}
      aria-label={label}
      aria-pressed={!collapsed}
    >
      {icon}
    </button>
  )
}

export function ActivityBar() {
  return (
    <nav data-slot="activity-bar" className="flex flex-col items-center pt-1">
      <ActivityBarItem icon={<Files className="h-5 w-5" />} label="Files" panelId="secondarySidebar" />
      <ActivityBarItem icon={<Search className="h-5 w-5" />} label="Search" panelId="secondarySidebar" />
      <ActivityBarItem icon={<GitBranch className="h-5 w-5" />} label="Git" panelId="secondarySidebar" />
      <ActivityBarItem icon={<Terminal className="h-5 w-5" />} label="Terminal" panelId="contentPanel" />
    </nav>
  )
}
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/activity-bar.tsx
git commit -m "feat: add activity bar with panel toggle buttons"
```

---

### Task 7: Create status bar

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/status-bar.tsx`

**Step 1: Write the status bar**

```tsx
export function StatusBar() {
  return (
    <div data-slot="status-bar" className="flex h-6 shrink-0 items-center px-3">
      <span className="text-[11px] text-muted-foreground">Ready</span>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/status-bar.tsx
git commit -m "feat: add status bar component"
```

---

### Task 8: Create barrel export

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/index.ts`

**Step 1: Write the barrel export**

```ts
export { useLayoutStore } from "./use-layout-store"
export {
  AppLayoutRoot,
  AppLayoutPrimarySidebar,
  AppLayoutTitleBar,
  AppLayoutChatPanel,
  AppLayoutContentPanel,
  AppLayoutSecondarySidebar,
  AppLayoutActivityBar,
} from "./app-layout"
export { TrafficLightsSection } from "./traffic-lights"
export { PrimaryTitleBar } from "./primary-titlebar"
export { SecondaryTitleBar } from "./secondary-titlebar"
export { ActivityBar } from "./activity-bar"
export { StatusBar } from "./status-bar"
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/index.ts
git commit -m "feat: add layout barrel exports"
```

---

### Task 9: Wire up App.tsx with new layout

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

**Step 1: Replace App.tsx with the new layout**

Structural divs (right container, panel row) are inlined directly — no wrapper components needed.

```tsx
import { AgentChat } from "./features/acp"
import {
  ActivityBar,
  AppLayoutActivityBar,
  AppLayoutChatPanel,
  AppLayoutContentPanel,
  AppLayoutPrimarySidebar,
  AppLayoutRoot,
  AppLayoutSecondarySidebar,
  AppLayoutTitleBar,
  PrimaryTitleBar,
  SecondaryTitleBar,
  StatusBar,
  TrafficLightsSection,
} from "./components/layout"

export default function App() {
  return (
    <AppLayoutRoot>
      <TrafficLightsSection />

      <AppLayoutPrimarySidebar>
        <div className="flex h-full flex-col p-3">
          <h2 className="text-xs font-semibold text-muted-foreground">Sessions</h2>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          </div>
        </div>
      </AppLayoutPrimarySidebar>

      {/* Right container: titlebar + panels + status bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppLayoutTitleBar>
          <PrimaryTitleBar />
          <SecondaryTitleBar />
        </AppLayoutTitleBar>

        <div className="flex min-h-0 flex-1">
          {/* Panel row */}
          <div className="flex min-h-0 flex-1 gap-1">
            <AppLayoutChatPanel>
              <AgentChat />
            </AppLayoutChatPanel>

            <AppLayoutContentPanel>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Content</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">Terminal, editor, browser</p>
                </div>
              </div>
            </AppLayoutContentPanel>

            <AppLayoutSecondarySidebar>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Files</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">File tree</p>
                </div>
              </div>
            </AppLayoutSecondarySidebar>
          </div>

          <AppLayoutActivityBar>
            <ActivityBar />
          </AppLayoutActivityBar>
        </div>

        <StatusBar />
      </div>
    </AppLayoutRoot>
  )
}
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Visual smoke test**

Run: `cd apps/desktop && bun run dev`

Verify:
- Layout renders with primary sidebar visible on left
- Chat panel (AgentChat) fills center
- Activity bar on far right with 4 icon buttons
- Clicking Files/Search/Git toggles secondary sidebar open/closed
- Clicking Terminal toggles content panel open/closed
- Panels animate in/out with spring transition
- Title bar shows "Neovate Desktop" on left, settings icon on right
- Status bar shows "Ready" at bottom

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx
git commit -m "feat: wire up multi-panel layout with AgentChat in chat panel"
```

---

### Task 10: Update index.html body classes

**Files:**
- Modify: `apps/desktop/src/renderer/index.html`

**Step 1: Add body styling classes**

Add `class="bg-background font-sans text-foreground antialiased"` to the `<body>` tag so the app background matches the theme. The current `index.html` has an unstyled `<body>`.

Change:
```html
<body>
```
To:
```html
<body class="bg-background font-sans text-foreground antialiased">
```

**Step 2: Visual verify**

Run: `cd apps/desktop && bun run dev`
Expected: Background color matches theme, no white flash on load

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/index.html
git commit -m "style: add theme classes to body element"
```
