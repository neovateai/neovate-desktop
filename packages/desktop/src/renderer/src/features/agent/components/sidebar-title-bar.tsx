import { FolderAddIcon, FilterIcon, FolderIcon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import debug from "debug";
import { CheckIcon, Plus } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import type { SidebarOrganize, SidebarSortBy } from "../../../../../shared/features/config/types";

import { Button } from "../../../components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../../../components/ui/menu";
import { useConfigStore } from "../../config/store";
import { useProject } from "../../project/hooks/use-project";
import { useProjectStore } from "../../project/store";
import { useNewSession } from "../hooks/use-new-session";

const log = debug("neovate:sidebar-title-bar");

export const SidebarTitleBar = memo(function SidebarTitleBar() {
  const { t } = useTranslation();
  const sidebarOrganize = useConfigStore((s) => s.sidebarOrganize);
  const sidebarSortBy = useConfigStore((s) => s.sidebarSortBy);
  const setConfig = useConfigStore((s) => s.setConfig);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { openProject } = useProject();
  const { createNewSession } = useNewSession();

  const handleOrganizeChange = (value: SidebarOrganize) => {
    log("organizeChange: %s", value);
    setConfig("sidebarOrganize", value);
  };

  const handleSortChange = (value: SidebarSortBy) => {
    log("sortChange: %s", value);
    setConfig("sidebarSortBy", value);
  };

  return (
    <div className="flex items-center justify-between px-2.5 py-1">
      <span className="text-sm font-medium text-muted-foreground/70">{t("sidebar.sessions")}</span>
      <div className="flex items-center gap-0.5">
        {sidebarOrganize === "chronological" && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={() => activeProject && createNewSession(activeProject.path)}
            disabled={!activeProject}
            title={t("sidebar.newChat")}
          >
            <Plus size={16} strokeWidth={1.5} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => openProject()}
          title={t("sidebar.addProject")}
        >
          <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={1.5} />
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                title={t("sidebar.filter")}
              >
                <HugeiconsIcon icon={FilterIcon} size={16} strokeWidth={1.5} />
              </Button>
            }
          />
          <MenuPopup side="bottom" align="end" className="text-xs">
            <MenuGroup>
              <MenuGroupLabel>{t("sidebar.organize")}</MenuGroupLabel>
              <MenuItem onClick={() => handleOrganizeChange("byProject")}>
                <HugeiconsIcon icon={FolderIcon} size={14} strokeWidth={1.5} />
                <span className="flex-1">{t("sidebar.organize.byProject")}</span>
                {sidebarOrganize === "byProject" && <CheckIcon size={12} />}
              </MenuItem>
              <MenuItem onClick={() => handleOrganizeChange("chronological")}>
                <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.5} />
                <span className="flex-1">{t("sidebar.organize.chronological")}</span>
                {sidebarOrganize === "chronological" && <CheckIcon size={12} />}
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>{t("sidebar.sortBy")}</MenuGroupLabel>
              <MenuItem onClick={() => handleSortChange("created")}>
                <span className="flex-1">{t("sidebar.sortBy.created")}</span>
                {sidebarSortBy === "created" && <CheckIcon size={14} />}
              </MenuItem>
              <MenuItem onClick={() => handleSortChange("updated")}>
                <span className="flex-1">{t("sidebar.sortBy.updated")}</span>
                {sidebarSortBy === "updated" && <CheckIcon size={14} />}
              </MenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
});
