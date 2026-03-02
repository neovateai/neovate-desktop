import { DashboardSquare01FreeIcons } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ActivityBarItem } from "../../core/plugin/contributions";
import { useRendererApp } from "../../core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useLayoutStore } from "./use-layout-store";

function ActivityBarButton({ item }: { item: ActivityBarItem }) {
  const activeView = useLayoutStore((s) => s.panels.secondarySidebar.activeView);
  const collapsed = useLayoutStore((s) => s.panels.secondarySidebar.collapsed);
  const setSecondarySidebarActiveView = useLayoutStore((s) => s.setSecondarySidebarActiveView);

  const { action } = item;

  const active =
    action.type === "secondarySidebarView" && activeView === action.viewId && !collapsed;

  const handleClick = () => {
    switch (action.type) {
      case "secondarySidebarView":
        setSecondarySidebarActiveView(action.viewId);
        break;
    }
  };

  const Icon = item.icon;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      title={item.tooltip}
      className={cn("hover:bg-accent", active && "bg-accent")}
    >
      <Icon className="size-4" />
    </Button>
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
      title="Panels"
      className={cn("hover:bg-accent", !collapsed && "bg-accent")}
    >
      <HugeiconsIcon icon={DashboardSquare01FreeIcons} size={16} strokeWidth={1.5} />
    </Button>
  );
}

export function AppLayoutActivityBar() {
  const app = useRendererApp();
  const items = app.pluginManager.contributions.activityBarItems;

  return (
    <nav
      data-slot="activity-bar"
      className="flex h-full w-10 shrink-0 flex-col items-center gap-1 pb-2"
    >
      {items.map((item) => (
        <ActivityBarButton key={item.id} item={item} />
      ))}
      <Separator className="my-1 w-6" />
      <ContentPanelToggle />
    </nav>
  );
}
