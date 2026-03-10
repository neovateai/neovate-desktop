import type React from "react";

import { Delete02Icon, FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../../../components/ui/menu";
import { useProject } from "../hooks/use-project";

interface ProjectSelectorProps {
  children?: React.ReactElement<Record<string, unknown>>;
  variant?: "menu" | "select";
}

export function ProjectSelector({ children, variant = "menu" }: ProjectSelectorProps) {
  const { projects, activeProject, loading, openProject, switchProject, removeProject } =
    useProject();

  return (
    <Menu>
      {variant === "select" ? (
        <MenuTrigger
          render={
            <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50">
              <span className={activeProject ? "text-foreground" : "text-muted-foreground"}>
                {activeProject?.name ?? "Select a project..."}
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
          <span>Open Project</span>
        </MenuItem>

        {projects.length > 0 && (
          <>
            <MenuSeparator />
            {projects.map((project) => {
              const isActive = activeProject?.id === project.id;

              return (
                <MenuItem
                  key={project.id}
                  onClick={() => switchProject(project.id)}
                  className="group"
                >
                  <div className="min-w-0 flex-1">
                    <div className={`truncate ${isActive ? "font-medium" : ""}`}>
                      {project.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{project.path}</div>
                  </div>
                  {isActive && (
                    <div className="p-1">
                      <CheckIcon size={14} />
                    </div>
                  )}
                  {!isActive && (
                    <button
                      className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
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
