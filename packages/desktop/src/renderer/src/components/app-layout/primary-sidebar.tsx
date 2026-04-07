import { motion } from "motion/react";
import { type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { APP_LAYOUT_GRID_AREA } from "./constants";
import { usePanelState } from "./store";

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 };

export function AppLayoutPrimarySidebar({ children }: { children: ReactNode }) {
  const { collapsed, width, isResizing } = usePanelState("primarySidebar");

  return (
    <motion.aside
      data-slot="primary-sidebar"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.primarySidebar }}
      className={cn(
        "box-border mt-2 ml-2 shrink-0 overflow-hidden rounded-l-[14px] rounded-r-[10px] pt-2",
        collapsed && "pointer-events-none",
      )}
      initial={false}
      animate={{ width: collapsed ? 0 : width }}
      transition={isResizing ? { duration: 0 } : SPRING}
    >
      {/* No <Activity> wrapper here — the sidebar already collapses to width:0 with
          overflow:hidden, so content is invisible. Using Activity would apply display:none,
          which makes base-ui accordion panels trigger data-starting-style:h-0 on re-show,
          visually collapsing all open project accordions. */}
      <div className="flex h-full flex-col" style={{ width }}>
        {/* Fixed spacer so the scrollable area (content + scrollbar track) starts below the top rounded corner */}
        <div className="shrink-0 h-7" />
        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">{children}</div>
      </div>
    </motion.aside>
  );
}
