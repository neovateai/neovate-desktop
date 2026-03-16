import type React from "react";

import { X, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Tab } from "../types";

import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../../../components/ui/tooltip";
import { useRendererApp } from "../../../core";
import { cn } from "../../../lib/utils";
type TabName = "Editor" | "Git Diff" | "Terminal" | "Review";
function TabButton({
  tab,
  isActive,
  isOrphan,
  ...rest
}: {
  tab: Tab;
  isActive: boolean;
  isOrphan: boolean;
} & React.ComponentPropsWithRef<"div">) {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const { t } = useTranslation();
  const views = app.pluginManager.contributions.contentPanelViews;
  const view = views.find((view) => view.name === tab.name);
  return (
    <div
      {...rest}
      role="tab"
      aria-selected={isActive}
      className={cn(
        "group flex select-none items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/50",
        isOrphan &&
          "text-muted-foreground/50 line-through decoration-muted-foreground/30 hover:text-muted-foreground",
        !isOrphan && isActive && "bg-accent text-accent-foreground",
        !isOrphan && !isActive && "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => !isOrphan && contentPanel.activateView(tab.id)}
    >
      {isOrphan && <TriangleAlert className="size-3 text-yellow-500" />}
      <view className="flex items-center">
        <span className="mr-1">{view?.icon && <view.icon className="size-3.5" />}</span>
        <span className="truncate font-medium">{t(`tab.${tab.name as TabName}`)}</span>
      </view>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn(
          "size-4 transition-opacity",
          isOrphan && "opacity-100",
          !isOrphan && isActive && "opacity-100",
          !isOrphan && !isActive && "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          contentPanel.closeView(tab.id);
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

export function TabItem({
  tab,
  isActive,
  isOrphan,
}: {
  tab: Tab;
  isActive: boolean;
  isOrphan: boolean;
}) {
  if (isOrphan) {
    return (
      <Tooltip>
        <TooltipTrigger
          delay={0}
          render={(props) => <TabButton {...props} tab={tab} isActive={isActive} isOrphan />}
        />
        <TooltipPopup side="bottom">
          &quot;{tab.name}&quot; is unavailable. You can close this tab.
        </TooltipPopup>
      </Tooltip>
    );
  }

  return <TabButton tab={tab} isActive={isActive} isOrphan={false} />;
}
