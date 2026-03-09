import debug from "debug";
import { FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { useConfigStore } from "../../config/store";
import { useNewSession } from "../hooks/use-new-session";
import { useLoadSession } from "../hooks/use-load-session";
import { useProject } from "../../project/hooks/use-project";
import { useFilteredSessions } from "../hooks/use-unified-sessions";
import { UnifiedSessionItem } from "./unified-session-item";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { Accordion, AccordionItem, AccordionPanel } from "../../../components/ui/accordion";
import type { Project } from "../../../../../shared/features/project/types";

const log = debug("neovate:project-accordion");

const DEFAULT_SESSION_LIMIT = 5;

// --- ProjectSessions ---

const ProjectSessions = memo(function ProjectSessions({ project }: { project: Project }) {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const loadSession = useLoadSession(project.path);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const items = useFilteredSessions({ projectPath: project.path, filter: "unpinned" });

  const visibleItems = expanded ? items : items.slice(0, DEFAULT_SESSION_LIMIT);
  const hiddenCount = items.length - DEFAULT_SESSION_LIMIT;

  const handleLoad = async (sessionId: string) => {
    setRestoring(sessionId);
    try {
      await loadSession(sessionId);
    } finally {
      setRestoring((prev) => (prev === sessionId ? null : prev));
    }
  };

  return (
    <ul className="flex flex-col gap-0.5">
      {visibleItems.map((item) => {
        const id = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
        return (
          <UnifiedSessionItem
            key={id}
            item={item}
            activeSessionId={activeSessionId}
            isPinned={false}
            restoring={restoring}
            onActivate={setActiveSession}
            onLoad={handleLoad}
          />
        );
      })}
      {hiddenCount > 0 && (
        <button
          className="cursor-pointer px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </ul>
  );
});

// --- ProjectAccordionList ---

export const ProjectAccordionList = memo(function ProjectAccordionList() {
  const projects = useProjectStore((s) => s.projects);
  const closedProjectAccordions = useConfigStore((s) => s.closedProjectAccordions);
  const setConfig = useConfigStore((s) => s.setConfig);
  const { removeProject, switchProject } = useProject();
  const { createNewSession } = useNewSession();

  const closedSet = useMemo(() => new Set(closedProjectAccordions), [closedProjectAccordions]);

  const handleCreateSession = useCallback(
    async (project: Project) => {
      const currentActive = useProjectStore.getState().activeProject;
      if (currentActive?.id !== project.id) {
        await switchProject(project.id);
      }
      await createNewSession(project.path);
    },
    [switchProject, createNewSession],
  );

  // All projects default to open; only explicitly closed ones are excluded
  const openAccordions = useMemo(
    () => projects.filter((p) => !closedSet.has(p.id)).map((p) => p.id),
    [projects, closedSet],
  );

  log("render: projects=%d openAccordions=%d", projects.length, openAccordions.length);

  const handleAccordionChange = useCallback(
    (openIds: string[]) => {
      const openSet = new Set(openIds);
      const closed = projects.filter((p) => !openSet.has(p.id)).map((p) => p.id);
      log("accordionChange: closed=%o", closed);
      setConfig("closedProjectAccordions", closed);
    },
    [projects, setConfig],
  );

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <HugeiconsIcon
            icon={FolderIcon}
            size={48}
            strokeWidth={1.5}
            className="mx-auto mb-2 text-muted-foreground"
          />
          <p className="text-sm font-medium text-muted-foreground">No projects</p>
          <p className="text-xs text-muted-foreground">
            Click the + icon above to add your first project
          </p>
        </div>
      </div>
    );
  }

  return (
    <Accordion value={openAccordions} onValueChange={handleAccordionChange} multiple>
      {projects.map((project) => (
        <AccordionItem key={project.id} value={project.id} className="border-b-0">
          <AccordionPrimitive.Header className="group flex items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <AccordionPrimitive.Trigger className="flex flex-1 cursor-pointer items-center gap-2 px-3 py-1.5 text-left">
              <div className="flex-shrink-0 group-hover:hidden">
                <HugeiconsIcon icon={FolderIcon} size={16} strokeWidth={1.5} />
              </div>
              <div className="hidden flex-shrink-0 group-hover:block">
                {!closedSet.has(project.id) ? (
                  <ChevronDown size={16} strokeWidth={1.5} />
                ) : (
                  <ChevronRight size={16} strokeWidth={1.5} />
                )}
              </div>
              <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
            </AccordionPrimitive.Trigger>
            <button
              className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                removeProject(project.id);
              }}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
            <button
              className="mr-1 rounded p-1 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleCreateSession(project);
              }}
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </AccordionPrimitive.Header>
          <AccordionPanel className="pb-1 pt-0">
            <ProjectSessions project={project} />
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
});
