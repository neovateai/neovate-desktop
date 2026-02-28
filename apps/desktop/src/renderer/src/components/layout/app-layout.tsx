import { Activity, type ReactNode } from "react"
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
      <Activity mode={collapsed ? "hidden" : "visible"}>
        <div className="h-full w-[300px]">{children}</div>
      </Activity>
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
      <Activity mode={collapsed ? "hidden" : "visible"}>
        <div className="h-full w-[300px]">{children}</div>
      </Activity>
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
      <Activity mode={collapsed ? "hidden" : "visible"}>
        <div className="h-full w-[240px]">{children}</div>
      </Activity>
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
