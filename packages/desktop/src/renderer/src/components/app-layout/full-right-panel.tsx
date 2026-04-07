import { X } from "lucide-react";

import { PluginsPanel } from "../../features/claude-code-plugins/components/plugins-panel";
import { SkillsPanel } from "../../features/skills/components/skills-panel";
import { useLayoutStore } from "./store";

export function FullRightPanel() {
  const fullRightPanelId = useLayoutStore((s) => s.fullRightPanelId);
  const closeFullRightPanel = useLayoutStore((s) => s.closeFullRightPanel);

  if (!fullRightPanelId) return null;

  return (
    <div
      data-slot="full-right-panel"
      className="z-10 flex flex-col bg-background"
      style={{ gridColumn: "3 / -1", gridRow: "1 / -1" }}
    >
      {/* Header with close button */}
      <div
        className="flex h-10 shrink-0 items-center justify-end px-3"
        style={{
          // @ts-expect-error - Electron specific CSS property
          WebkitAppRegion: "drag",
        }}
      >
        <button
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          style={{
            // @ts-expect-error - Electron specific CSS property
            WebkitAppRegion: "no-drag",
          }}
          onClick={closeFullRightPanel}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-8 pb-12">
        <div className="mx-auto max-w-3xl">
          {fullRightPanelId === "skills" && <SkillsPanel />}
          {fullRightPanelId === "plugins" && <PluginsPanel />}
        </div>
      </div>
    </div>
  );
}
