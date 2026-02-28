import { type ReactNode } from "react";
import {
  PanelLeftIcon,
  PanelRightIcon,
  Settings01Icon,
  ViewSidebarLeftIcon,
  ViewSidebarRightIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { Button } from "../ui/button";
import { useLayoutStore } from "./use-layout-store";

const springTransition = { type: "spring" as const, stiffness: 300, damping: 30 };
const COLLAPSED_TITLEBAR_LEFT_MARGIN = 136;

export function AppLayoutRoot({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="app-layout-root"
      data-testid="app-root"
      className="relative flex h-screen w-screen overflow-hidden"
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
      className="[-webkit-app-region:drag] flex h-11 shrink-0 select-none items-center"
      animate={{ marginLeft: collapsed ? COLLAPSED_TITLEBAR_LEFT_MARGIN : 0 }}
      transition={{ type: "spring" as const, stiffness: 360, damping: 34 }}
    >
      {children}
    </motion.div>
  );
}

export function AppLayoutChatPanel({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="chat-panel"
      className="min-w-[320px] flex-1 overflow-hidden rounded-lg bg-card pb-2"
    >
      {children}
    </div>
  );
}

export function AppLayoutTrafficLights() {
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar?.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const isOpen = !collapsed;

  return (
    <div
      data-slot="traffic-lights"
      className="[-webkit-app-region:no-drag] pointer-events-auto fixed z-[100] flex items-center gap-1"
      style={{ top: 11, left: 82 }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="relative !size-6"
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
    </div>
  );
}

export function AppLayoutPrimaryTitleBar() {
  return (
    <div
      data-slot="primary-titlebar"
      className="[-webkit-app-region:no-drag] relative flex shrink-0 items-center gap-1"
    >
      <span data-testid="app-title" className="px-2 text-sm font-medium">
        Neovate Desktop
      </span>
    </div>
  );
}

export function AppLayoutSecondaryTitleBar() {
  const secondaryCollapsed = useLayoutStore((s) => s.panels.secondarySidebar?.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  return (
    <div
      data-slot="secondary-titlebar"
      className="[-webkit-app-region:drag] flex flex-1 items-center"
    >
      <div className="flex-1" />
      <div className="[-webkit-app-region:no-drag] flex shrink-0 items-center gap-0.5 pr-2">
        <Button variant="ghost" size="icon-sm" className="size-7" title="Settings">
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={() => togglePanel("secondarySidebar")}
          title={secondaryCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <HugeiconsIcon
            icon={secondaryCollapsed ? PanelRightIcon : ViewSidebarRightIcon}
            size={16}
            strokeWidth={1.5}
          />
        </Button>
      </div>
    </div>
  );
}

export function AppLayoutPanelSeparator({ panelId }: { panelId: string }) {
  const collapsed = useLayoutStore((s) => s.panels[panelId]?.collapsed);
  if (collapsed) return null;
  return <div className="w-[5px] shrink-0" />;
}

export function AppLayoutStatusBar() {
  return (
    <div data-slot="status-bar" className="flex h-6 shrink-0 items-center px-3">
      <span className="text-[11px] text-muted-foreground">Ready</span>
    </div>
  );
}
