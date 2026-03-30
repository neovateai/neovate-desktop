import { X, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import type { ContentPanelView } from "../../core/plugin/contributions";
import type { ContentPanelStoreState } from "../../features/content-panel/types";

import { resolveLocalizedString } from "../../../../shared/i18n";
import { useRendererApp } from "../../core";
import { useConfigStore } from "../../features/config/store";
import { ContentPanelViewContextProvider } from "../../features/content-panel";
import { useProjectStore } from "../../features/project/store";

function useLazyComponents(views: ContentPanelView[]) {
  const cache = useRef(new Map<string, React.LazyExoticComponent<React.ComponentType>>());
  for (const view of views) {
    if (!cache.current.has(view.viewType)) {
      cache.current.set(view.viewType, lazy(view.component));
    }
  }
  return cache.current;
}

export function ContentPanelTabs() {
  const { t } = useTranslation();
  const locale = useConfigStore((s) => s.locale);
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const views = app.pluginManager.viewContributions.contentPanelViews.map((c) => c.value);
  const lazyComponents = useLazyComponents(views);

  const activeProject = useProjectStore((s) => s.activeProject);
  const projectPath = activeProject?.path ?? "";

  // Sync projectPath to ContentPanel
  useEffect(() => {
    contentPanel.setProjectPath(projectPath);
  }, [contentPanel, projectPath]);

  // Track which projects have been mounted (lazy project mount)
  const mountedProjects = useRef(new Set<string>());
  if (projectPath) {
    mountedProjects.current.add(projectPath);
  }

  const projects = useStore(contentPanel.store, (s: ContentPanelStoreState) => s.projects);

  if (!projectPath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">{t("contentPanel.noProjectSelected")}</p>
      </div>
    );
  }

  const projectState = projects[projectPath] ?? {
    tabs: [],
    activeTabId: null,
  };
  const { tabs, activeTabId } = projectState;

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 border-b border-border px-1 h-10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`group flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              activeTabId === tab.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            onClick={() => contentPanel.activateView(tab.id)}
          >
            <span className="truncate">
              {(() => {
                const view = views.find((v) => v.viewType === tab.viewType);
                return view ? resolveLocalizedString(view.name, locale) : tab.viewType;
              })()}
            </span>
            <span
              role="button"
              tabIndex={0}
              className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                contentPanel.closeView(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  contentPanel.closeView(tab.id);
                }
              }}
            >
              <X className="size-3" />
            </span>
          </button>
        ))}

        {/* New tab button */}
        <NewTabMenu views={views} onSelect={(viewId) => contentPanel.openView(viewId)} />
      </div>

      {/* View rendering area */}
      <div className="relative min-h-0 flex-1">
        {Object.entries(projects)
          .filter(([path]) => mountedProjects.current.has(path))
          .map(([path, state]) => {
            const isActiveProject = path === projectPath;
            return (
              <div key={path} style={{ display: isActiveProject ? "contents" : "none" }}>
                {state.tabs.map((tab) => {
                  const view = views.find((v) => v.viewType === tab.viewType);
                  if (!view) return null;
                  const LazyComponent = lazyComponents.get(tab.viewType);
                  if (!LazyComponent) return null;
                  const isActiveTab = state.activeTabId === tab.id;
                  return (
                    <div
                      key={tab.id}
                      className="absolute inset-0"
                      style={{
                        display: isActiveTab ? "contents" : "none",
                      }}
                    >
                      <Suspense>
                        <ContentPanelViewContextProvider viewId={tab.id}>
                          <LazyComponent />
                        </ContentPanelViewContextProvider>
                      </Suspense>
                    </div>
                  );
                })}
              </div>
            );
          })}

        {/* Empty state */}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">{t("contentPanel.noTabsOpen")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NewTabMenu({
  views,
  onSelect,
}: {
  views: ContentPanelView[];
  onSelect: (viewType: string) => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const locale = useConfigStore((s) => s.locale);

  return (
    <details ref={menuRef} className="relative">
      <summary className="flex cursor-pointer list-none items-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
        <Plus className="size-3.5" />
      </summary>
      <div className="absolute top-full left-0 z-50 mt-1 min-w-32 rounded-md border border-border bg-popover p-1 shadow-md">
        {views.map((view) => (
          <button
            key={view.viewType}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-popover-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onSelect(view.viewType);
              menuRef.current?.removeAttribute("open");
            }}
          >
            {view.icon && <view.icon className="size-3.5" />}
            <span>{resolveLocalizedString(view.name, locale)}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
