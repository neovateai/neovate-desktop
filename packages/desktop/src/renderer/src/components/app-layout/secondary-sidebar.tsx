import { Activity, lazy, Suspense, useRef } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { useRendererApp } from "../../core";
import { useLayoutStore } from "./use-layout-store";
import type { SecondarySidebarView } from "../../core/plugin/contributions";

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
  const collapsed = useLayoutStore((s) => s.panels.secondarySidebar.collapsed);
  const activeView = useLayoutStore((s) => s.panels.secondarySidebar.activeView);
  const app = useRendererApp();
  const views = app.pluginManager.contributions.secondarySidebarViews;
  const lazyComponents = useLazyComponents(views);

  return (
    <motion.aside
      data-slot="secondary-sidebar"
      className={cn(
        "h-full shrink-0 overflow-hidden rounded-lg bg-card",
        collapsed && "pointer-events-none",
      )}
      animate={{ width: collapsed ? 0 : 240 }}
      transition={SPRING}
    >
      <div className="h-full w-[240px] pb-2">
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
