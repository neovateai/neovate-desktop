import type { ActivityBarItem } from "../../core/plugin/contributions";

import { useRendererApp } from "../../core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { APP_LAYOUT_GRID_AREA } from "./constants";
import { useLayoutStore } from "./store";

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

export function AppLayoutActivityBar() {
  const app = useRendererApp();
  const items = app.pluginManager.contributions.activityBarItems;

  return (
    <nav
      data-slot="activity-bar"
      style={{ gridArea: APP_LAYOUT_GRID_AREA.activityBar }}
      className="flex h-full w-10 shrink-0 flex-col items-center gap-1 pb-2"
    >
      {items.map((item) => (
        <ActivityBarButton key={item.id} item={item} />
      ))}
    </nav>
  );
}
