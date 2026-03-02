import { FolderOpenIcon, PlusIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useProject } from "../hooks/use-project";
import { Popover, PopoverTrigger, PopoverPopup } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";

export function ProjectSelector() {
  const { projects, activeProject, loading, openProject, switchProject, removeProject } =
    useProject();

  return (
    <Popover>
      <PopoverTrigger
        className="flex w-full items-center gap-2 rounded-md border border-input px-2 py-1.5 text-left text-sm shadow-xs/5 hover:bg-accent/50"
        disabled={loading}
      >
        <FolderOpenIcon className="size-3.5 shrink-0 opacity-60" />
        <span className="min-w-0 flex-1 truncate">
          {activeProject ? activeProject.name : "No project"}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-40" />
      </PopoverTrigger>

      <PopoverPopup side="bottom" align="start" sideOffset={4} className="w-64">
        <div className="space-y-1">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 cursor-pointer"
              onClick={() => switchProject(project.id)}
            >
              <FolderOpenIcon className="size-3.5 shrink-0 opacity-60" />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate ${activeProject?.id === project.id ? "font-medium" : ""}`}
                >
                  {project.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">{project.path}</div>
              </div>
              <button
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  removeProject(project.id);
                }}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}

          {projects.length > 0 && <div className="my-1 border-t" />}

          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={openProject}>
            <PlusIcon className="size-3.5" />
            Open folder...
          </Button>

          {activeProject && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => switchProject(null)}
            >
              Clear selection
            </Button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
