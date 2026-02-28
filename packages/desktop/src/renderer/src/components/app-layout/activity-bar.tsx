import {
  DashboardSquare01FreeIcons,
  FolderIcon,
  GitBranchIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useLayoutStore } from "./use-layout-store";

type ActivityBarButtonProps = {
  icon: typeof FolderIcon;
  title: string;
  panelId: string;
};

function ActivityBarButton({ icon, title, panelId }: ActivityBarButtonProps) {
  const collapsed = useLayoutStore((s) => s.panels[panelId]?.collapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const active = !collapsed;

  return (
    <Button
      variant="ghost"
      onClick={() => togglePanel(panelId)}
      title={title}
      className={cn("hover:bg-accent", active && "bg-accent")}
    >
      <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
    </Button>
  );
}

export function AppLayoutActivityBar() {
  return (
    <nav data-slot="activity-bar" className="flex h-full w-12 shrink-0 flex-col items-center py-2">
      <ActivityBarButton icon={FolderIcon} title="Files" panelId="secondarySidebar" />
      <ActivityBarButton icon={Search01Icon} title="Search" panelId="secondarySidebar" />
      <ActivityBarButton icon={GitBranchIcon} title="Git" panelId="secondarySidebar" />
      <Separator className="my-1 w-6" />
      <ActivityBarButton icon={DashboardSquare01FreeIcons} title="Panels" panelId="contentPanel" />
    </nav>
  );
}
