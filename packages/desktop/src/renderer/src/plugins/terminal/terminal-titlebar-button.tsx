import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "zustand";

// TODO: Replace direct store imports with app-level APIs once available.
// useLayoutStore → app.workbench.layout.store (needs store exposure on WorkbenchLayoutService)
// useProjectStore → app.project reactive hook (needs useSyncExternalStore wrapper)
import { useLayoutStore } from "../../components/app-layout/store";
import { Button } from "../../components/ui/button";
import { useRendererApp } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { cn } from "../../lib/utils";

export default function TerminalTitlebarButton() {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const layout = app.workbench.layout;

  const projectPath = useProjectStore((s) => s.activeProject?.path);
  const panelCollapsed = useLayoutStore((s) => s.panels.contentPanel.collapsed);

  const isTerminalActive = useStore(contentPanel.store, (s) => {
    if (!projectPath) return false;
    const project = s.projects[projectPath];
    if (!project?.activeTabId) return false;
    const activeTab = project.tabs.find((t) => t.id === project.activeTabId);
    return activeTab?.viewType === "terminal";
  });

  const isActive = isTerminalActive && !panelCollapsed;

  const handleClick = () => {
    if (isTerminalActive) {
      layout.togglePart("contentPanel");
      return;
    }
    contentPanel.toggleView("terminal");
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={!projectPath}
      className={cn("size-7 hover:bg-accent", isActive && "bg-accent")}
      onClick={handleClick}
    >
      <HugeiconsIcon icon={ComputerTerminal01Icon} size={16} strokeWidth={1.5} />
    </Button>
  );
}
