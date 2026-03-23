import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { APP_LAYOUT_GRID_AREA } from "./constants";
import { usePanelState } from "./store";

export function AppLayoutContentPanel({ children }: { children?: ReactNode }) {
  const { collapsed } = usePanelState("contentPanel");

  return (
    <div
      data-slot="content-panel"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.contentPanel, contain: "layout" }}
      className={cn(
        "h-full shrink-0 overflow-hidden rounded-lg bg-card backdrop-blur-lg shadow-[-2px_0_8px_rgba(0,0,0,0.05)]",
        collapsed && "pointer-events-none",
      )}
    >
      {children}
    </div>
  );
}
