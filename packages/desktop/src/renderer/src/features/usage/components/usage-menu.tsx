import { ArrowLeft, BarChart3, Sparkles, TrendingUp, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { UsageMenuId } from "../store";

import { cn } from "../../../lib/utils";
import { useUsageStore } from "../store";

interface MenuItem {
  id: UsageMenuId;
  icon: typeof BarChart3;
}

const menuItems: MenuItem[] = [
  { id: "overview", icon: BarChart3 },
  { id: "tools", icon: Wrench },
  { id: "analytics", icon: TrendingUp },
  { id: "wrapped", icon: Sparkles },
];

const MENU_LABEL_KEYS = {
  overview: "usage.overview",
  tools: "usage.tools",
  analytics: "usage.analytics",
  wrapped: "usage.wrapped",
} as const satisfies Record<UsageMenuId, string>;

export function UsageMenu({
  activeMenu,
  onMenuSelect,
}: {
  activeMenu: UsageMenuId;
  onMenuSelect: (id: UsageMenuId) => void;
}) {
  const { t } = useTranslation();
  const setShowUsage = useUsageStore((state) => state.setShowUsage);

  return (
    <div
      className="flex h-full w-56 flex-col border-r border-border bg-background px-3 pt-10"
      style={{
        // @ts-expect-error - Electron specific CSS property
        WebkitAppRegion: "drag",
      }}
    >
      {/* Back to app button */}
      <button
        className="mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          // @ts-expect-error - Electron specific CSS property
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => setShowUsage(false)}
      >
        <ArrowLeft className="size-4" />
        <span>{t("usage.backToApp")}</span>
      </button>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Menu items */}
      <nav className="flex-1 space-y-0.5 px-1">
        {menuItems.map((item) => {
          const isActive = activeMenu === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              style={{
                // @ts-expect-error - Electron specific CSS property
                WebkitAppRegion: "no-drag",
              }}
              onClick={() => onMenuSelect(item.id)}
            >
              <Icon className={cn("size-[18px]", isActive && "text-primary")} />
              <span>{t(MENU_LABEL_KEYS[item.id])}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
