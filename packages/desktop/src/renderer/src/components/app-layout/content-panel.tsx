import { type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { useLayoutStore } from "./use-layout-store";

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 };

export function AppLayoutContentPanel({ children }: { children: ReactNode }) {
  const collapsed = useLayoutStore((s) => s.panels.contentPanel?.collapsed);

  return (
    <motion.div
      data-slot="content-panel"
      className={cn(
        "h-full shrink-0 overflow-hidden rounded-lg bg-card",
        collapsed && "pointer-events-none",
      )}
      animate={{ width: collapsed ? 0 : 300 }}
      transition={SPRING}
    >
      <div className="h-full w-[300px] pb-2">{children}</div>
    </motion.div>
  );
}
