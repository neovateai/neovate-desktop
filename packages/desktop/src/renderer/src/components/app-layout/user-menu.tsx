import { Settings03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChartColumnBig, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "../../features/settings";
import { useStatsStore } from "../../plugins/stats/store";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";

export function UserMenu() {
  const { t } = useTranslation();
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);
  const setShowStats = useStatsStore((s) => s.setShowStats);

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full border border-border/60 hover:border-border"
            title={t("user.menu")}
          />
        }
      >
        <User size={14} strokeWidth={1.8} />
      </MenuTrigger>

      <MenuPopup align="end" sideOffset={5}>
        <MenuItem onClick={() => setShowStats(true)}>
          <ChartColumnBig size={14} strokeWidth={1.5} className="opacity-60" />
          <span>{t("user.usageStats")}</span>
        </MenuItem>

        <MenuSeparator />

        <MenuItem onClick={() => setShowSettings(true)}>
          <HugeiconsIcon icon={Settings03Icon} size={14} strokeWidth={1.5} className="opacity-60" />
          <span>{t("user.settings")}</span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
