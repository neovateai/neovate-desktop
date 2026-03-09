import { motion } from "motion/react";
import { Activity, lazy, Suspense, useRef } from "react";

import type { SecondarySidebarView } from "../../core/plugin/contributions";

import { useRendererApp } from "../../core";
import { cn } from "../../lib/utils";
import { APP_LAYOUT_GRID_AREA } from "./constants";
import { usePanelState, useLayoutStore } from "./store";

const SPRING = { type: "spring" as const, stiffness: 600, damping: 49 };

function useLazyComponents(views: SecondarySidebarView[]) {
  const cache = useRef(new Map<string, React.LazyExoticComponent<React.ComponentType>>());
  for (const view of views) {
    if (!cache.current.has(view.id)) {
      cache.current.set(view.id, lazy(view.component));
    }
  }
  return cache.current;
}

export function AppLayoutSecondarySidebar() {
  const { collapsed, width, isResizing } = usePanelState("secondarySidebar");
  const activeView = useLayoutStore((s) => s.panels.secondarySidebar?.activeView);
  const app = useRendererApp();
  const views = app.pluginManager.contributions.secondarySidebarViews;
  const lazyComponents = useLazyComponents(views);

  return (
    <motion.aside
      data-slot="secondary-sidebar"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.secondarySidebar }}
      className={cn(
        "h-full shrink-0 overflow-hidden rounded-lg bg-card",
        collapsed && "pointer-events-none",
      )}
      initial={false}
      animate={{ width: collapsed ? 0 : width }}
      transition={isResizing ? { duration: 0 } : SPRING}
    >
      <div className="h-full pb-2" style={{ width }}>
        {views.map((view) => {
          const LazyComponent = lazyComponents.get(view.id)!;
          return (
            <Activity key={view.id} mode={activeView === view.id ? "visible" : "hidden"}>
              <Suspense>
                <LazyComponent />
              </Suspense>
            </Activity>
          );
        })}
      </div>
    </motion.aside>
  );
}
