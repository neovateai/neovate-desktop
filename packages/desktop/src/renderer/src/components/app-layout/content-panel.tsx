import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { APP_LAYOUT_GRID_AREA } from "./constants";
import { usePanelState } from "./store";

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 };

export function AppLayoutContentPanel({ children }: { children?: ReactNode }) {
  const { collapsed, width, isResizing } = usePanelState("contentPanel");

  return (
    <motion.div
      data-slot="content-panel"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.contentPanel }}
      className={cn(
        "h-full shrink-0 overflow-hidden rounded-lg bg-card",
        collapsed && "pointer-events-none",
      )}
      initial={false}
      animate={{ width: collapsed ? 0 : width }}
      transition={isResizing ? { duration: 0 } : SPRING}
    >
      {children}
    </motion.div>
  );
}
