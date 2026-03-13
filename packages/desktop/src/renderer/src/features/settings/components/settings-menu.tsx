import {
  ArrowLeft,
  BookOpen,
  HelpCircle,
  Keyboard,
  MessageSquare,
  Server,
  Bolt,
  Wand2,
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
  { id: "skills", icon: Wand2 },
  { id: "keybindings", icon: Keyboard },
  { id: "about", icon: HelpCircle },
];

const MENU_LABEL_KEYS = {
  general: "settings.general",
  chat: "settings.chat",
  providers: "settings.providers",
  rules: "settings.rules",
  skills: "settings.skills",
  keybindings: "settings.keybindings",
  about: "settings.about",
  mcp: "settings.mcp.title",
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
      className="w-56 h-full flex flex-col pt-8 border-r border-border bg-background"
      style={{
        // @ts-expect-error - Electron specific CSS property
        WebkitAppRegion: "drag",
      }}
    >
      {/* Back to app button */}
      <button
        className="flex items-center text-muted-foreground gap-3 ml-2 px-4 py-3 text-sm transition-colors cursor-pointer hover:text-foreground border-b border-border"
        style={{
          // @ts-expect-error - Electron specific CSS property
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => setShowSettings(false)}
      >
        <ArrowLeft className="size-4" />
        <span>Back to app</span>
      </button>

      {/* Menu items */}
      <nav className="flex-1 py-2">
        {menuItems.map((item) => {
          const isActive = activeMenu === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer rounded-[6px] mx-2 ",
                isActive
                  ? "bg-accent text-accent-foreground border-border"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
              style={{
                // @ts-expect-error - Electron specific CSS property
                WebkitAppRegion: "no-drag",
              }}
              onClick={() => onMenuSelect(item.id)}
            >
              <Icon className="size-[18px]" />
              <span>{t(MENU_LABEL_KEYS[item.id])}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
