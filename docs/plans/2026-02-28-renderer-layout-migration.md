# Renderer Layout Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-panel layout (primary sidebar, chat, content panel, secondary sidebar, activity bar, title bars, status bar) from scratch in neovate-desktop, inspired by neovate-code-desktop's layout.

**Architecture:** React context provides panel visibility state (`Record<string, PanelState>`). Layout components are thin wrappers using Tailwind + `motion` for animated show/hide. AgentChat stays as-is in the chat panel. All other panels get placeholder content.

**Tech Stack:** React 19, Tailwind CSS 4, motion (Framer Motion), Lucide icons, existing `cn()` utility

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

### Task 2: Create layout state provider

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/app-layout-provider.tsx`

**Step 1: Write the provider**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

type PanelState = {
  collapsed: boolean
}

type LayoutContextValue = {
  panels: Record<string, PanelState>
  togglePanel: (id: string) => void
  isPanelOpen: (id: string) => boolean
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

const DEFAULT_PANELS: Record<string, PanelState> = {
  primarySidebar: { collapsed: false },
  contentPanel: { collapsed: true },
  secondarySidebar: { collapsed: true },
}

export function AppLayoutProvider({ children }: { children: ReactNode }) {
  const [panels, setPanels] = useState<Record<string, PanelState>>(DEFAULT_PANELS)

  const togglePanel = useCallback((id: string) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], collapsed: !prev[id]?.collapsed },
    }))
  }, [])

  const isPanelOpen = useCallback(
    (id: string) => !panels[id]?.collapsed,
    [panels],
  )

  const value = useMemo(
    () => ({ panels, togglePanel, isPanelOpen }),
    [panels, togglePanel, isPanelOpen],
  )

  return <LayoutContext value={value}>{children}</LayoutContext>
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error("useLayout must be used within AppLayoutProvider")
  }
  return context
}
```

**Step 2: Verify typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/layout/app-layout-provider.tsx
git commit -m "feat: add layout state provider with panel visibility context"
```

---

### Task 3: Create layout container components

**Files:**
- Create: `apps/desktop/src/renderer/src/components/layout/app-layout.tsx`

This file contains the root layout and all panel slot components. Each is a thin wrapper with Tailwind classes and motion animation.

**Step 1: Write the layout components**

```tsx
import { type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useLayout } from "./app-layout-provider"

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 }

export function AppLayoutRoot({ children }: { children: ReactNode }) {
  return (
    <div data-slot="app-layout-root" className="flex h-screen w-screen overflow-hidden p-2">
      {children}
    </div>
  )
}

export function AppLayoutPrimarySidebar({ children }: { children: ReactNode }) {
  const { isPanelOpen } = useLayout()
  const open = isPanelOpen("primarySidebar")

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          data-slot="primary-sidebar"
          className="h-full w-[300px] shrink-0 overflow-hidden rounded-lg bg-card"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={SPRING}
        >
          <div className="h-full w-[300px]">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export function AppLayoutRightContainer({ children }: { children: ReactNode }) {
  return (
    <div data-slot="right-container" className="flex min-w-0 flex-1 flex-col">
      {children}
    </div>
  )
}

export function AppLayoutTitleBar({ children }: { children: ReactNode }) {
  return (
    <div data-slot="titlebar" className="flex h-10 shrink-0 items-center">
      {children}
    </div>
  )
}

export function AppLayoutPanelRow({ children }: { children: ReactNode }) {
  return (
    <div data-slot="panel-row" className="flex min-h-0 flex-1 gap-1">
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
  const { isPanelOpen } = useLayout()
  const open = isPanelOpen("contentPanel")

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          data-slot="content-panel"
          className="h-full w-[300px] shrink-0 overflow-hidden rounded-lg bg-card"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={SPRING}
        >
          <div className="h-full w-[300px]">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function AppLayoutSecondarySidebar({ children }: { children: ReactNode }) {
  const { isPanelOpen } = useLayout()
  const open = isPanelOpen("secondarySidebar")

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          data-slot="secondary-sidebar"
          className="h-full w-[240px] shrink-0 overflow-hidden rounded-lg bg-card"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 240, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={SPRING}
        >
          <div className="h-full w-[240px]">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
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
import { useLayout } from "./app-layout-provider"

export function TrafficLightsSection() {
  const { togglePanel, isPanelOpen } = useLayout()
  const sidebarOpen = isPanelOpen("primarySidebar")

  return (
    <div data-slot="traffic-lights" className="flex w-[76px] shrink-0 items-center justify-end pr-1">
      <button
        type="button"
        onClick={() => togglePanel("primarySidebar")}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
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
import { useLayout } from "./app-layout-provider"

type ActivityBarItemProps = {
  icon: React.ReactNode
  label: string
  panelId: string
}

function ActivityBarItem({ icon, label, panelId }: ActivityBarItemProps) {
  const { togglePanel, isPanelOpen } = useLayout()
  const active = isPanelOpen(panelId)

  return (
    <button
      type="button"
      onClick={() => togglePanel(panelId)}
      className={cn(
        "flex h-10 w-full items-center justify-center text-muted-foreground hover:text-foreground",
        active && "text-foreground",
      )}
      aria-label={label}
      aria-pressed={active}
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
export { AppLayoutProvider, useLayout } from "./app-layout-provider"
export {
  AppLayoutRoot,
  AppLayoutPrimarySidebar,
  AppLayoutRightContainer,
  AppLayoutTitleBar,
  AppLayoutPanelRow,
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

```tsx
import { AgentChat } from "./features/acp"
import {
  ActivityBar,
  AppLayoutActivityBar,
  AppLayoutChatPanel,
  AppLayoutContentPanel,
  AppLayoutPanelRow,
  AppLayoutPrimarySidebar,
  AppLayoutProvider,
  AppLayoutRightContainer,
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
    <AppLayoutProvider>
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

        <AppLayoutRightContainer>
          <AppLayoutTitleBar>
            <PrimaryTitleBar />
            <SecondaryTitleBar />
          </AppLayoutTitleBar>

          <div className="flex min-h-0 flex-1">
            <AppLayoutPanelRow>
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
            </AppLayoutPanelRow>

            <AppLayoutActivityBar>
              <ActivityBar />
            </AppLayoutActivityBar>
          </div>

          <StatusBar />
        </AppLayoutRightContainer>
      </AppLayoutRoot>
    </AppLayoutProvider>
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
