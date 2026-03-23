import { BarChart3, ChevronRight, Settings, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "../features/settings";
import { useUsageStore } from "../features/usage";
import { Button } from "./ui/button";
import { Menu, MenuPopup, MenuTrigger } from "./ui/menu";

interface MenuOptionProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
}

function MenuOption({ icon, label, description, onClick }: MenuOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="truncate text-xs text-muted-foreground">{description}</div>}
      </div>
      <ChevronRight className="size-4 text-muted-foreground/50" />
    </button>
  );
}

export function UserAvatarMenu() {
  const { t } = useTranslation();
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  const setShowUsage = useUsageStore((s) => s.setShowUsage);
  const [open, setOpen] = useState(false);

  const handleUsageClick = () => {
    setOpen(false);
    setShowUsage(true);
  };

  const handleSettingsClick = () => {
    setOpen(false);
    setShowSettings(true);
  };

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        openOnHover
        delay={0}
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-full"
            title={t("sidebar.userMenu")}
          />
        }
      >
        <User className="size-4 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="bottom" align="end" sideOffset={8} className="w-64 p-2">
        <div className="space-y-1">
          <MenuOption
            icon={<BarChart3 className="size-4 text-primary" />}
            label={t("usage.title")}
            description={t("usage.menuDescription")}
            onClick={handleUsageClick}
          />
          <MenuOption
            icon={<Settings className="size-4 text-muted-foreground" />}
            label={t("sidebar.settings")}
            description={t("settings.menuDescription")}
            onClick={handleSettingsClick}
          />
        </div>
      </MenuPopup>
    </Menu>
  );
}
