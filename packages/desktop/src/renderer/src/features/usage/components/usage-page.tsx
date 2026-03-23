import { useEffect, useMemo } from "react";

import { matchesBinding, DEFAULT_KEYBINDINGS } from "../../../lib/keybindings";
import { useConfigStore } from "../../config/store";
import { useUsageStore } from "../store";
import { AnalyticsPanel } from "./panels/analytics-panel";
import { OverviewPanel } from "./panels/overview-panel";
import { ToolsPanel } from "./panels/tools-panel";
import { WrappedPanel } from "./panels/wrapped-panel";
import { UsageMenu } from "./usage-menu";

export function UsagePage() {
  const activeMenu = useUsageStore((state) => state.activeTab);
  const setActiveMenu = useUsageStore((state) => state.setActiveTab);
  const setShowUsage = useUsageStore((state) => state.setShowUsage);

  const rawKeybindings = useConfigStore((state) => state.keybindings);
  const keybindings = useMemo(
    () => ({ ...DEFAULT_KEYBINDINGS, ...rawKeybindings }),
    [rawKeybindings],
  );

  // Cmd+Esc to close usage page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesBinding(e, keybindings.closeSettings)) {
        e.preventDefault();
        setShowUsage(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowUsage, keybindings]);

  return (
    <div className="absolute inset-0 z-50 flex bg-background">
      {/* Left Sidebar */}
      <UsageMenu activeMenu={activeMenu} onMenuSelect={setActiveMenu} />

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-card to-background">
        {/* Draggable header area */}
        <div
          className="h-10"
          style={{
            // @ts-expect-error - Electron specific CSS property
            WebkitAppRegion: "drag",
          }}
        />
        <div className="mx-auto max-w-5xl px-8 pb-12">
          {activeMenu === "overview" && <OverviewPanel />}
          {activeMenu === "tools" && <ToolsPanel />}
          {activeMenu === "analytics" && <AnalyticsPanel />}
          {activeMenu === "wrapped" && <WrappedPanel />}
        </div>
      </div>
    </div>
  );
}
