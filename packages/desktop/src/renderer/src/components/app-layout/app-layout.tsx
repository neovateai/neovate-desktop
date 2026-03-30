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
import { useTranslation } from "react-i18next";

import type { SeparatorId } from "./types";

import { resolveLocalizedString } from "../../../../shared/i18n";
import { getChatPanelBgUrl } from "../../assets/images";
import { useRendererApp } from "../../core/app";
import { type TitlebarItem } from "../../core/plugin/contributions";
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
import { Separator } from "../ui/separator";
import {
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
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
      className="min-w-0 overflow-hidden rounded-lg pb-2 bg-card backdrop-blur-lg shadow-[-2px_0_8px_rgba(0,0,0,0.05)]"
      style={{
        gridArea: APP_LAYOUT_GRID_AREA.chatPanel,
        backgroundImage:
          !activeSession || activeSession.isNew
            ? `url("${getChatPanelBgUrl(resolvedTheme as "dark" | "light" | undefined)}")`
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
  const { t } = useTranslation();
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
      style={{ top: 9, left: 82 }}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn("relative !size-6 hover:bg-accent", isOpen && "bg-accent")}
        onClick={() => togglePanel("primarySidebar")}
        title={isOpen ? t("sidebar.hideSidebar") : t("sidebar.showSidebar")}
      >
        <motion.span
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: isOpen ? 1 : 0 }}
          transition={springTransition}
        >
          <HugeiconsIcon icon={ViewSidebarLeftIcon} size={18} strokeWidth={1.8} />
        </motion.span>
        <motion.span
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: isOpen ? 0 : 1 }}
          transition={springTransition}
        >
          <HugeiconsIcon icon={PanelLeftIcon} size={18} strokeWidth={1.8} />
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
          className="!size-6 !px-0"
          onClick={() => activeProject && createNewSession(activeProject.path)}
          disabled={!activeProject}
          title={t("sidebar.newChat")}
        >
          <Plus size={16} strokeWidth={1.5} />
        </Button>
      </motion.div>
    </div>
  );
}

export function AppLayoutPrimaryTitleBar() {
  const { t } = useTranslation();
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
          <span className="truncate">{activeProject?.name ?? t("sidebar.noProject")}</span>
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

const secondaryTitlebarTooltipHandle = TooltipCreateHandle<string>();

export function AppLayoutSecondaryTitleBar() {
  const { t } = useTranslation();
  const secondaryCollapsed = useLayoutStore((s) => s.panels.secondarySidebar?.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const activeProject = useProjectStore((s) => s.activeProject);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  const locale = useConfigStore((s) => s.locale);
  const app = useRendererApp();
  const items = app.pluginManager.viewContributions.secondaryTitlebarItems.map((c) => c.value);
  const lazyComponents = useLazyComponents(items);

  return (
    <div
      data-slot="secondary-titlebar"
      className="[-webkit-app-region:drag] flex flex-1 items-center"
    >
      <div className="flex-1" />
      <div className="[-webkit-app-region:no-drag] flex shrink-0 items-center gap-1 pr-1.5">
        {activeProject && <OpenAppButton cwd={activeProject.path} />}
        <TooltipProvider delay={0}>
          {items.map((item) => {
            const Component = lazyComponents.get(item.id)!;
            return (
              <Suspense key={item.id}>
                {item.tooltip ? (
                  <TooltipTrigger
                    handle={secondaryTitlebarTooltipHandle}
                    payload={resolveLocalizedString(item.tooltip, locale)}
                    render={<span className="inline-flex" />}
                  >
                    <Component />
                  </TooltipTrigger>
                ) : (
                  <Component />
                )}
              </Suspense>
            );
          })}
          <Tooltip handle={secondaryTitlebarTooltipHandle}>
            {({ payload }) => <TooltipPopup side="bottom">{payload}</TooltipPopup>}
          </Tooltip>
        </TooltipProvider>
        <Separator orientation="vertical" className="mx-2 my-1 w-[2px] rounded-xl" />
        <ContentPanelToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => togglePanel("secondarySidebar")}
          title={secondaryCollapsed ? t("sidebar.showSidebar") : t("sidebar.hideSidebar")}
          className={cn("hover:bg-accent", !secondaryCollapsed && "bg-accent")}
        >
          <HugeiconsIcon
            icon={secondaryCollapsed ? PanelRightIcon : ViewSidebarRightIcon}
            size={16}
            strokeWidth={1.8}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          title={t("sidebar.settings")}
          onClick={() => setShowSettings(true)}
        >
          <HugeiconsIcon icon={Settings03Icon} size={16} strokeWidth={1.8} />
        </Button>
      </div>
    </div>
  );
}

export function AppLayoutPanelSeparator({ id }: { id: SeparatorId }) {
  return <ResizeHandle id={id} style={{ gridArea: APP_LAYOUT_GRID_AREA[id] }} />;
}

export function AppLayoutStatusBar() {
  const { t } = useTranslation();
  return (
    <div data-slot="status-bar" className="flex h-6 shrink-0 items-center px-3">
      <span className="text-[11px] text-muted-foreground">{t("status.ready")}</span>
    </div>
  );
}

function ContentPanelToggle() {
  const { t } = useTranslation();
  const collapsed = useLayoutStore((s) => s.panels.contentPanel.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => togglePanel("contentPanel")}
      title={collapsed ? t("sidebar.showContentPanel") : t("sidebar.hideContentPanel")}
      className={cn("hover:bg-accent", !collapsed && "bg-accent")}
    >
      <HugeiconsIcon
        icon={collapsed ? SidebarRightIcon : SidebarRight01Icon}
        size={16}
        strokeWidth={1.8}
      />
    </Button>
  );
}
