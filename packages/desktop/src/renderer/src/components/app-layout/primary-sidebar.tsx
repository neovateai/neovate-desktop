import { Activity, type ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "../../lib/utils"
import { useLayoutStore } from "./use-layout-store"

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 }

export function AppLayoutPrimarySidebar({ children }: { children: ReactNode }) {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed)

  return (
    <motion.aside
      data-slot="primary-sidebar"
      className={cn(
        "h-full shrink-0 overflow-hidden rounded-l-[14px] rounded-r-[10px] bg-card shadow-[0_0_6px_rgba(0,0,0,0.06)]",
        collapsed && "pointer-events-none",
      )}
      animate={{ width: collapsed ? 0 : 300 }}
      transition={SPRING}
    >
      <Activity mode={collapsed ? "hidden" : "visible"}>
        <div className="flex h-full w-[300px] flex-col pt-8">
          {children}
        </div>
      </Activity>
    </motion.aside>
  )
}
