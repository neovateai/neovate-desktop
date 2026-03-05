import { X, TriangleAlert } from "lucide-react";
import { useRendererApp } from "../../../core";
import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../../../components/ui/tooltip";
import type { Tab } from "../types";

function TabButton({
  tab,
  isActive,
  isOrphan,
}: {
  tab: Tab;
  isActive: boolean;
  isOrphan: boolean;
}) {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;

  return (
    <div
      role="tab"
      aria-selected={isActive}
      className={cn(
        "group flex select-none items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/50",
        isOrphan &&
          "text-muted-foreground/50 line-through decoration-muted-foreground/30 hover:text-muted-foreground",
        !isOrphan && isActive && "bg-accent text-accent-foreground",
        !isOrphan && !isActive && "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => !isOrphan && contentPanel.activateView(tab.id)}
    >
      {isOrphan && <TriangleAlert className="size-3 text-yellow-500" />}
      <span className="truncate">{tab.name}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn(
          "size-4 transition-opacity",
          isOrphan && "opacity-100",
          !isOrphan && "opacity-0 group-hover:opacity-100",
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
        <TooltipTrigger render={<TabButton tab={tab} isActive={isActive} isOrphan />} delay={0} />
        <TooltipPopup side="bottom">
          &quot;{tab.name}&quot; is unavailable. You can close this tab.
        </TooltipPopup>
      </Tooltip>
    );
  }

  return <TabButton tab={tab} isActive={isActive} isOrphan={false} />;
}
