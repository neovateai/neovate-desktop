import { type ReactNode } from "react"
import { PanelLeft, Settings } from "lucide-react"
import { useLayoutStore } from "./use-layout-store"

export function AppLayoutRoot({ children }: { children: ReactNode }) {
  return (
    <div data-slot="app-layout-root" className="flex h-screen w-screen overflow-hidden p-2">
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

export function AppLayoutChatPanel({ children }: { children: ReactNode }) {
  return (
    <div data-slot="chat-panel" className="min-w-[320px] flex-1 overflow-hidden rounded-lg bg-card">
      {children}
    </div>
  )
}

export function AppLayoutTrafficLights() {
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

export function AppLayoutPrimaryTitleBar() {
  return (
    <div
      data-slot="primary-titlebar"
      className="flex flex-1 items-center px-3"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span
        className="text-xs font-medium text-muted-foreground"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        Neovate Desktop
      </span>
    </div>
  )
}

export function AppLayoutSecondaryTitleBar() {
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

export function AppLayoutStatusBar() {
  return (
    <div data-slot="status-bar" className="flex h-6 shrink-0 items-center px-3">
      <span className="text-[11px] text-muted-foreground">Ready</span>
    </div>
  )
}
