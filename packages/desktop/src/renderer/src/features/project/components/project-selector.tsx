import type React from "react";

import { Delete02Icon, FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PLAYGROUND_PROJECT_ID } from "../../../../../shared/features/project/constants";
import { Popover, PopoverPopup, PopoverTrigger } from "../../../components/ui/popover";
import { useProject } from "../hooks/use-project";

interface ProjectSelectorProps {
  children?: React.ReactElement<Record<string, unknown>>;
  variant?: "menu" | "select";
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function ProjectSelector({ children, variant = "menu" }: ProjectSelectorProps) {
  const { t } = useTranslation();
  const { projects, activeProject, loading, openProject, switchProject, removeProject } =
    useProject();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setHighlightIndex(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    );
  }, [projects, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const project = filtered[highlightIndex];
        if (project && !project.pathMissing) {
          switchProject(project.id);
          setOpen(false);
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("neovate:focus-input"));
          });
        }
      }
    },
    [filtered, highlightIndex, switchProject],
  );

  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${highlightIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setHighlightIndex(0);
  }, []);

  const handleOpenProject = useCallback(() => {
    setOpen(false);
    openProject();
  }, [openProject]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "select" ? (
        <PopoverTrigger
          render={
            <button className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-[var(--background-secondary)] px-4 py-2 text-sm hover:bg-accent/50">
              <span className={activeProject ? "text-foreground" : "text-muted-foreground"}>
                {activeProject?.name ?? t("project.selectProject")}
              </span>
              <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
            </button>
          }
        />
      ) : (
        <PopoverTrigger render={children} />
      )}
      <PopoverPopup
        side="bottom"
        align={variant === "select" ? "center" : "start"}
        className="w-80"
        viewportClassName="py-1 [--viewport-inline-padding:--spacing(1)]"
      >
        <div onKeyDown={handleKeyDown}>
          {projects.length > 0 && (
            <div className="px-1 pb-1">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  type="text"
                  className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring"
                  placeholder={t("project.searchPlaceholder")}
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}

          <button
            className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm text-foreground outline-none hover:bg-accent"
            onClick={handleOpenProject}
            disabled={loading}
          >
            <HugeiconsIcon icon={FolderIcon} size={16} strokeWidth={1.5} />
            <span>{t("project.openProject")}</span>
          </button>

          {filtered.length > 0 ? (
            <>
              <div className="mx-2 my-1 h-px bg-border" />
              <div ref={listRef} className="max-h-60 overflow-y-auto">
                {filtered.map((project, i) => {
                  const isActive = activeProject?.id === project.id;
                  const isStale = project.pathMissing;

                  return (
                    <button
                      key={project.id}
                      data-index={i}
                      className={`group flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-sm outline-none ${
                        highlightIndex === i
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-accent"
                      } ${isStale ? "opacity-50" : ""}`}
                      onClick={() => {
                        if (!isStale) {
                          switchProject(project.id);
                          setOpen(false);
                          requestAnimationFrame(() => {
                            window.dispatchEvent(new CustomEvent("neovate:focus-input"));
                          });
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`flex items-center gap-1.5 truncate ${isActive ? "font-medium" : ""}`}
                        >
                          {isStale && (
                            <TriangleAlertIcon size={14} className="shrink-0 text-warning" />
                          )}
                          <span className="truncate">
                            <HighlightMatch text={project.name} query={search} />
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {isStale ? (
                            t("project.pathMissing")
                          ) : (
                            <HighlightMatch text={project.path} query={search} />
                          )}
                        </div>
                      </div>
                      {isActive && (
                        <div className="p-1">
                          <CheckIcon size={14} />
                        </div>
                      )}
                      {!isActive && project.id !== PLAYGROUND_PROJECT_ID && (
                        <div
                          className={`rounded p-1 transition-opacity hover:bg-destructive/10 ${isStale ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProject(project.id);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          role="button"
                          tabIndex={-1}
                        >
                          <HugeiconsIcon
                            icon={Delete02Icon}
                            size={14}
                            strokeWidth={1.5}
                            className="text-destructive"
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : projects.length > 0 && search ? (
            <>
              <div className="mx-2 my-1 h-px bg-border" />
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("project.noResults")}
              </div>
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
