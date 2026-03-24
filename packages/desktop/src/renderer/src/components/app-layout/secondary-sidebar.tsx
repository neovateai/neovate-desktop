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

function SecondarySidebarViewRenderer({
  children,
  isActive,
  deactivation = "activity",
}: {
  children: React.ReactNode;
  isActive: boolean;
  deactivation?: SecondarySidebarView["deactivation"];
}) {
  if (deactivation === "unmount" && !isActive) return null;

  if (deactivation === "offscreen") {
    return (
      <div className={cn("absolute top-0 h-full w-full", isActive ? "left-0" : "-left-[9999em]")}>
        {children}
      </div>
    );
  }

  if (deactivation === "hidden") {
    return (
      <div
        className={cn("absolute inset-0", !isActive && "hidden")}
        aria-hidden={!isActive || undefined}
      >
        {children}
      </div>
    );
  }

  // activity (default)
  return (
    <Activity mode={isActive ? "visible" : "hidden"}>
      <div className="absolute inset-0">{children}</div>
    </Activity>
  );
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
        "h-full shrink-0 overflow-hidden rounded-lg bg-card backdrop-blur-lg shadow-[-2px_0_8px_rgba(0,0,0,0.05)]",
        collapsed && "pointer-events-none",
      )}
      initial={false}
      animate={{ width: collapsed ? 0 : width }}
      transition={isResizing ? { duration: 0 } : SPRING}
    >
      <div className="relative h-full pb-2" style={{ width }}>
        {views.map((view) => {
          const LazyComponent = lazyComponents.get(view.id)!;
          return (
            <SecondarySidebarViewRenderer
              key={view.id}
              isActive={activeView === view.id}
              deactivation={view.deactivation}
            >
              <Suspense>
                <LazyComponent />
              </Suspense>
            </SecondarySidebarViewRenderer>
          );
        })}
      </div>
    </motion.aside>
  );
}
