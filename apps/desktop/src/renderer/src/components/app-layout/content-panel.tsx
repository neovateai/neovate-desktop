import { Activity, type ReactNode } from "react"
import { motion } from "motion/react"
import { useLayoutStore } from "./use-layout-store"

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 }

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
