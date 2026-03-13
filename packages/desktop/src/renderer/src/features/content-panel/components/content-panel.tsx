import { useTheme } from "next-themes";
import { Activity, lazy, Suspense, useEffect, useRef } from "react";
import { useStore } from "zustand";

import type { ContentPanelView } from "../../../core/plugin/contributions";
import type { ContentPanelStoreState } from "../types";

import { useRendererApp } from "../../../core";
import { cn } from "../../../lib/utils";
import { useProjectStore } from "../../project/store";
import { TabBar } from "./tab-bar";
import { ContentPanelViewContextProvider } from "./view-context";

function useLazyComponents(views: ContentPanelView[]) {
  const cache = useRef(new Map<string, React.LazyExoticComponent<React.ComponentType>>());
  for (const view of views) {
    if (!cache.current.has(view.viewType)) {
      cache.current.set(view.viewType, lazy(view.component));
    }
  }
  return cache.current;
}

function TabViewWithActivity({
  children,
  isActive,
  deactivation = "hidden",
}: {
  children: React.ReactNode;
  isActive: boolean;
  deactivation?: ContentPanelView["deactivation"];
}) {
  // unmount: destroy when inactive
  if (deactivation === "unmount" && !isActive) return null;

  // offscreen: left off-screen (Hyper's approach — pauses xterm via IntersectionObserver)
  if (deactivation === "offscreen") {
    return (
      <div className={cn("absolute top-0 h-full w-full", isActive ? "left-0" : "-left-[9999em]")}>
        {children}
      </div>
    );
  }

  // activity: React <Activity>, preserves state + cleans up effects when hidden
  if (deactivation === "activity") {
    return (
      <Activity mode={isActive ? "visible" : "hidden"}>
        <div className="absolute inset-0">{children}</div>
      </Activity>
    );
  }

  // hidden (default): display none
  return (
    <div
      className={cn("absolute inset-0", !isActive && "hidden")}
      aria-hidden={!isActive || undefined}
    >
      {children}
    </div>
  );
}

function EmptyState({
  message,
  imgSrc = "/src/assets/images/empty1.png",
  imgWidth = 67,
}: {
  message: string;
  imgSrc?: string;
  imgWidth?: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      {imgSrc && (
        <img
          src={imgSrc}
          alt="Empty"
          className="shrink-0"
          style={{ width: imgWidth + "px" }}
          aria-hidden
        />
      )}
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function ContentPanelRenderer() {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const views = app.pluginManager.contributions.contentPanelViews;
  const lazyComponents = useLazyComponents(views);

  const activeProject = useProjectStore((s) => s.activeProject);
  const projectPath = activeProject?.path ?? "";
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    contentPanel.setProjectPath(projectPath);
  }, [contentPanel, projectPath]);

  const mountedProjects = useRef(new Set<string>());
  if (projectPath) {
    mountedProjects.current.add(projectPath);
  }

  const projects = useStore(contentPanel.store, (s: ContentPanelStoreState) => s.projects);

  if (!projectPath) {
    return <EmptyState message="No project selected" />;
  }

  const projectState = projects[projectPath] ?? { tabs: [], activeTabId: null };
  const { tabs, activeTabId } = projectState;

  return (
    <div className="flex h-full flex-col px-1.5">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        registeredViewTypes={contentPanel.registeredViewTypes}
      />

      <div className="relative min-h-0 flex-1">
        {Object.entries(projects)
          .filter(([path]) => mountedProjects.current.has(path))
          .map(([path, state]) => {
            const isActiveProject = path === projectPath;
            return (
              <div key={path} style={{ display: isActiveProject ? "contents" : "none" }}>
                {state.tabs.map((tab) => {
                  const view = views.find((v) => v.viewType === tab.viewType);
                  const LazyComponent = view ? lazyComponents.get(tab.viewType) : undefined;
                  if (!view || !LazyComponent) return null;
                  return (
                    <TabViewWithActivity
                      key={tab.id}
                      isActive={state.activeTabId === tab.id}
                      deactivation={view.deactivation}
                    >
                      <Suspense>
                        <ContentPanelViewContextProvider viewId={tab.id}>
                          <LazyComponent />
                        </ContentPanelViewContextProvider>
                      </Suspense>
                    </TabViewWithActivity>
                  );
                })}
              </div>
            );
          })}

        {tabs.length === 0 && (
          <EmptyState
            message="No tabs open"
            imgSrc={`/src/assets/images/empty1${resolvedTheme === "dark" ? "-dark" : ""}.png`}
          />
        )}
      </div>
    </div>
  );
}
