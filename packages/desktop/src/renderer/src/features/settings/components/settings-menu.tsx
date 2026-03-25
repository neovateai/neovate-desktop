import {
  ArrowLeft,
  BookOpen,
  HelpCircle,
  Keyboard,
  MessageSquare,
  Server,
  Bolt,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SettingsMenuId } from "../store";

import { cn } from "../../../lib/utils";
import { useSettingsStore } from "../store";

interface MenuItem {
  id: SettingsMenuId;
  icon: typeof Bolt;
}

const menuItems: MenuItem[] = [
  { id: "general", icon: Bolt },
  { id: "chat", icon: MessageSquare },
  { id: "providers", icon: Server },
  { id: "rules", icon: BookOpen },
  { id: "keybindings", icon: Keyboard },
  { id: "about", icon: HelpCircle },
];

const MENU_LABEL_KEYS = {
  general: "settings.general",
  chat: "settings.chat",
  providers: "settings.providers",
  rules: "settings.rules",
  keybindings: "settings.keybindings",
  about: "settings.about",
} as const satisfies Record<SettingsMenuId, string>;

export const SettingsMenu = ({
  activeMenu,
  onMenuSelect,
}: {
  activeMenu: SettingsMenuId;
  onMenuSelect: (id: SettingsMenuId) => void;
}) => {
  const { t } = useTranslation();
  const setShowSettings = useSettingsStore((state) => state.setShowSettings);

  return (
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
        onClick={() => setShowSettings(false)}
      >
        <ArrowLeft className="size-4" />
        <span>{t("settings.backToApp")}</span>
      </button>

      {/* Divider */}
      <div className="my-2 mx-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

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
                "w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
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
};
