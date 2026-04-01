import { ArrowLeft, ChartColumnBig } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useConfigStore } from "../../features/config/store";
import { matchesBinding, DEFAULT_KEYBINDINGS } from "../../lib/keybindings";
import { cn } from "../../lib/utils";
import StatsView from "./stats-view";
import { useStatsStore } from "./store";

export function StatsPage() {
  const { t } = useTranslation();
  const setShowStats = useStatsStore((s) => s.setShowStats);

  const rawKeybindings = useConfigStore((state) => state.keybindings);
  const keybindings = useMemo(
    () => ({ ...DEFAULT_KEYBINDINGS, ...rawKeybindings }),
    [rawKeybindings],
  );

  // Cmd+Esc to close stats
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesBinding(e, keybindings.closeSettings)) {
        e.preventDefault();
        setShowStats(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowStats, keybindings]);

  return (
    <div className="absolute inset-0 z-50 flex bg-background">
      {/* Left Sidebar - matches settings-menu.tsx */}
      <div
        className="w-56 h-full flex flex-col pt-10 px-3 border-r border-border bg-background"
        style={{
          // @ts-expect-error - Electron specific CSS property
          WebkitAppRegion: "drag",
        }}
      >
        {/* Back to app button */}
        <button
          className="flex items-center gap-3 mx-1 px-2.5 py-2 text-sm text-muted-foreground rounded-lg transition-all duration-150 cursor-pointer hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            // @ts-expect-error - Electron specific CSS property
            WebkitAppRegion: "no-drag",
          }}
          onClick={() => setShowStats(false)}
        >
          <ArrowLeft className="size-4" />
          <span>{t("settings.backToApp")}</span>
        </button>

        {/* Divider */}
        <div className="my-2 mx-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Menu item - single active item */}
        <nav className="flex-1 space-y-0.5 px-1">
          <button
            aria-current="page"
            className={cn(
              "w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "bg-primary/10 text-primary font-medium",
            )}
            style={{
              // @ts-expect-error - Electron specific CSS property
              WebkitAppRegion: "no-drag",
            }}
          >
            <ChartColumnBig className="size-[18px] text-primary" />
            <span>{t("user.usageStats")}</span>
          </button>
        </nav>
      </div>

      {/* Right Content - matches settings-page.tsx */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-card to-background">
        {/* Draggable header area */}
        <div
          className="h-10"
          style={{
            // @ts-expect-error - Electron specific CSS property
            WebkitAppRegion: "drag",
          }}
        />
        <div className="mx-auto max-w-4xl px-8 pb-12">
          <StatsView />
        </div>
      </div>
    </div>
  );
}
