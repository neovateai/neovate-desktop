import type React from "react";

import { Delete02Icon, FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, ChevronsUpDownIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../../../components/ui/menu";
import { useProject } from "../hooks/use-project";

interface ProjectSelectorProps {
  children?: React.ReactElement<Record<string, unknown>>;
  variant?: "menu" | "select";
}

export function ProjectSelector({ children, variant = "menu" }: ProjectSelectorProps) {
  const { t } = useTranslation();
  const { projects, activeProject, loading, openProject, switchProject, removeProject } =
    useProject();

  return (
    <Menu>
      {variant === "select" ? (
        <MenuTrigger
          render={
            <button className="inline-flex items-center gap-2 rounded-full border border-input bg-[var(--background-secondary)] px-4 py-2 text-sm hover:bg-accent/50">
              <span className={activeProject ? "text-foreground" : "text-muted-foreground"}>
                {activeProject?.name ?? t("project.selectProject")}
              </span>
              <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
            </button>
          }
        />
      ) : (
        <MenuTrigger render={children} />
      )}
      <MenuPopup side="bottom" align={variant === "select" ? "center" : "start"}>
        <MenuItem onClick={openProject} disabled={loading}>
          <HugeiconsIcon icon={FolderIcon} size={16} strokeWidth={1.5} />
          <span>{t("project.openProject")}</span>
        </MenuItem>

        {projects.length > 0 && (
          <>
            <MenuSeparator />
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id;
              const isStale = project.pathMissing;

              return (
                <MenuItem
                  key={project.id}
                  onClick={() => !isStale && switchProject(project.id)}
                  className={`group ${isStale ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`flex items-center gap-1.5 truncate ${isActive ? "font-medium" : ""}`}
                    >
                      {isStale && <TriangleAlertIcon size={14} className="shrink-0 text-warning" />}
                      <span className="truncate">{project.name}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {isStale ? t("project.pathMissing") : project.path}
                    </div>
                  </div>
                  {isActive && (
                    <div className="p-1">
                      <CheckIcon size={14} />
                    </div>
                  )}
                  {!isActive && (
                    <button
                      className={`rounded p-1 transition-opacity hover:bg-destructive/10 ${isStale ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProject(project.id);
                      }}
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        size={14}
                        strokeWidth={1.5}
                        className="text-destructive"
                      />
                    </button>
                  )}
                </MenuItem>
              );
            })}
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
