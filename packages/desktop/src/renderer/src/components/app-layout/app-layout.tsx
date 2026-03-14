import {
  ArrowDown01Icon,
  FolderIcon,
  PanelLeftIcon,
  PanelRightIcon,
  Settings03Icon,
  ViewSidebarLeftIcon,
  ViewSidebarRightIcon,
  SidebarRightIcon,
  SidebarRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { type ReactNode, Suspense, lazy, useRef } from "react";

import type { TitlebarItem } from "../../core/plugin/contributions";
import type { SeparatorId } from "./types";

import { useRendererApp } from "../../core/app";
import { SessionInfoBar } from "../../features/agent/components/session-info-bar";
import { useNewSession } from "../../features/agent/hooks/use-new-session";
import { useAgentStore } from "../../features/agent/store";
import { useConfigStore } from "../../features/config/store";
import { OpenAppButton } from "../../features/open-in";
import { ProjectSelector } from "../../features/project/components/project-selector";
import { useProjectStore } from "../../features/project/store";
import { useSettingsStore } from "../../features/settings";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  APP_LAYOUT_COLLAPSED_TITLEBAR_LEFT_MARGIN,
  APP_LAYOUT_GRID,
  APP_LAYOUT_GRID_AREA,
} from "./constants";
import { usePanelResize } from "./hooks";
import { ResizeHandle } from "./resize-handle";
import { useLayoutStore } from "./store";

function useLazyComponents(items: TitlebarItem[]) {
  const cache = useRef(new Map<string, React.LazyExoticComponent<React.ComponentType>>());
  for (const item of items) {
    if (!cache.current.has(item.id)) {
      cache.current.set(item.id, lazy(item.component));
    }
  }
  return cache.current;
}

export function AppLayoutRoot({ children }: { children: ReactNode }) {
  usePanelResize();

  return (
    <div
      data-slot="app-layout-root"
      data-testid="app-root"
      className="relative grid h-screen w-screen overflow-hidden pb-2 bg-background"
      style={APP_LAYOUT_GRID}
    >
      <div className="[-webkit-app-region:drag] absolute inset-x-0 top-0 h-10" />
      {children}
    </div>
  );
}

export function AppLayoutTitleBar({ children }: { children: ReactNode }) {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed);

  return (
    <motion.div
      data-slot="titlebar"
      className="[-webkit-app-region:drag] flex h-11 select-none items-center"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.titleBar }}
      animate={{ marginLeft: collapsed ? APP_LAYOUT_COLLAPSED_TITLEBAR_LEFT_MARGIN : 0 }}
      transition={{ type: "spring" as const, stiffness: 360, damping: 34 }}
    >
      {children}
    </motion.div>
  );
}

export function AppLayoutChatPanel({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const sessions = useAgentStore((s) => s.sessions);
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
  return (
    <div
      data-slot="chat-panel"
      className="min-w-0 overflow-hidden rounded-lg pb-2 bg-card shadow-[-2px_0_8px_rgba(0,0,0,0.05)]"
      style={{
        gridArea: APP_LAYOUT_GRID_AREA.chatPanel,
        backgroundImage:
          !activeSession || activeSession.isNew
            ? `url("/src/assets/images/chat-panel-bg-${resolvedTheme === "dark" ? "dark" : "light"}.png")`
            : "",
        backgroundSize: "cover",
        backgroundPosition: "0 0",
        backgroundRepeat: "no-repeat",
      }}
    >
      {children}
    </div>
  );
}

export function AppLayoutTrafficLights() {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { createNewSession } = useNewSession();
  const isOpen = !collapsed;
  const springTransition = { type: "spring" as const, stiffness: 300, damping: 30 };

  return (
    <div
      data-slot="traffic-lights"
      className="[-webkit-app-region:no-drag] pointer-events-auto fixed z-[100] flex items-center gap-1"
      style={{ top: 11, left: 82 }}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn("relative !size-6 hover:bg-accent", isOpen && "bg-accent")}
        onClick={() => togglePanel("primarySidebar")}
        title={isOpen ? "Hide sidebar" : "Show sidebar"}
      >
        <motion.span
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: isOpen ? 1 : 0 }}
          transition={springTransition}
        >
          <HugeiconsIcon icon={ViewSidebarLeftIcon} size={18} strokeWidth={1.5} />
        </motion.span>
        <motion.span
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: isOpen ? 0 : 1 }}
          transition={springTransition}
        >
          <HugeiconsIcon icon={PanelLeftIcon} size={18} strokeWidth={1.5} />
        </motion.span>
      </Button>
      <motion.div
        initial={false}
        animate={{ opacity: collapsed ? 1 : 0, width: collapsed ? "auto" : 0 }}
        transition={springTransition}
        className="overflow-hidden"
      >
        <Button
          variant="ghost"
          size="icon"
          className="!size-6"
          onClick={() => activeProject && createNewSession(activeProject.path)}
          disabled={!activeProject}
          title="New chat"
        >
          <Plus size={16} strokeWidth={1.5} />
        </Button>
      </motion.div>
    </div>
  );
}

export function AppLayoutPrimaryTitleBar() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const multiProjectSupport = useConfigStore((s) => s.multiProjectSupport);

  if (multiProjectSupport) {
    return (
      <div
        data-slot="primary-titlebar"
        className="[-webkit-app-region:no-drag] relative flex shrink-0 items-center gap-1 pl-2"
      >
        <SessionInfoBar />
      </div>
    );
  }

  return (
    <div
      data-slot="primary-titlebar"
      className="[-webkit-app-region:no-drag] relative flex shrink-0 items-center gap-1"
    >
      <ProjectSelector>
        <button
          data-testid="app-title"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent/50"
        >
          <HugeiconsIcon icon={FolderIcon} size={14} strokeWidth={1.5} className="opacity-60" />
          <span className="truncate">{activeProject?.name ?? "No project"}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={1.5}
            className="shrink-0 opacity-40"
          />
        </button>
      </ProjectSelector>
    </div>
  );
}

export function AppLayoutSecondaryTitleBar() {
  const secondaryCollapsed = useLayoutStore((s) => s.panels.secondarySidebar?.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const activeProject = useProjectStore((s) => s.activeProject);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  const app = useRendererApp();
  const items = app.pluginManager.contributions.secondaryTitlebarItems;
  const lazyComponents = useLazyComponents(items);

  return (
    <div
      data-slot="secondary-titlebar"
      className="[-webkit-app-region:drag] flex flex-1 items-center"
    >
      <div className="flex-1" />
      <div className="[-webkit-app-region:no-drag] flex shrink-0 items-center gap-1 pr-1.5">
        {activeProject && <OpenAppButton cwd={activeProject.path} />}
        {items.map((item) => {
          const Component = lazyComponents.get(item.id)!;
          return (
            <Suspense key={item.id}>
              <Component />
            </Suspense>
          );
        })}
        <ContentPanelToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => togglePanel("secondarySidebar")}
          title={secondaryCollapsed ? "Show sidebar" : "Hide sidebar"}
          className={cn("hover:bg-accent", !secondaryCollapsed && "bg-accent")}
        >
          <HugeiconsIcon
            icon={secondaryCollapsed ? PanelRightIcon : ViewSidebarRightIcon}
            size={16}
            strokeWidth={1.5}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          <HugeiconsIcon icon={Settings03Icon} size={16} strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

export function AppLayoutPanelSeparator({ id }: { id: SeparatorId }) {
  return <ResizeHandle id={id} style={{ gridArea: APP_LAYOUT_GRID_AREA[id] }} />;
}

export function AppLayoutStatusBar() {
  return (
    <div data-slot="status-bar" className="flex h-6 shrink-0 items-center px-3">
      <span className="text-[11px] text-muted-foreground">Ready</span>
    </div>
  );
}

function ContentPanelToggle() {
  const collapsed = useLayoutStore((s) => s.panels.contentPanel.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => togglePanel("contentPanel")}
      title={collapsed ? "Show content panel" : "Hide content panel"}
      className={cn("hover:bg-accent", !collapsed && "bg-accent")}
    >
      <HugeiconsIcon
        icon={collapsed ? SidebarRightIcon : SidebarRight01Icon}
        size={16}
        strokeWidth={1.5}
      />
    </Button>
  );
}
