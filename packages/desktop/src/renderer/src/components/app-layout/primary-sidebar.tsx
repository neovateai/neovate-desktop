import { motion } from "motion/react";
import { type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { APP_LAYOUT_GRID_AREA } from "./constants";
import { AppLayoutPanelActivity } from "./panel-activity";
import { usePanelState } from "./store";

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 };

export function AppLayoutPrimarySidebar({ children }: { children: ReactNode }) {
  const { collapsed, width, isResizing } = usePanelState("primarySidebar");

  return (
    <motion.aside
      data-slot="primary-sidebar"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.primarySidebar }}
      className={cn(
        "box-border mt-2 ml-2 shrink-0 overflow-hidden rounded-l-[14px] rounded-r-[10px] bg-card pt-2 shadow-[0_0_6px_rgba(0,0,0,0.06)]",
        collapsed && "pointer-events-none",
      )}
      initial={false}
      animate={{ width: collapsed ? 0 : width }}
      transition={isResizing ? { duration: 0 } : SPRING}
    >
      <AppLayoutPanelActivity active={!collapsed}>
        <div className="flex h-full flex-col overflow-y-auto pt-8" style={{ width }}>
          {children}
        </div>
      </AppLayoutPanelActivity>
    </motion.aside>
  );
}
