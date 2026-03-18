import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import debug from "debug";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import type { Project } from "../../../../../shared/features/project/types";

import { Accordion, AccordionItem, AccordionPanel } from "../../../components/ui/accordion";
import { useProject } from "../../project/hooks/use-project";
import { useProjectStore } from "../../project/store";
import { useLoadSession } from "../hooks/use-load-session";
import { useNewSession } from "../hooks/use-new-session";
import { useFilteredSessions } from "../hooks/use-unified-sessions";
import { useAgentStore } from "../store";
import { EmptySessionState } from "./empty-session-state";
import { UnifiedSessionItem } from "./unified-session-item";

const log = debug("neovate:project-accordion");

const DEFAULT_SESSION_LIMIT = 5;

// --- ProjectSessions ---

const ProjectSessions = memo(function ProjectSessions({ project }: { project: Project }) {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const sessionsLoaded = useAgentStore((s) => s.sessionsLoaded);
  const loadSession = useLoadSession(project.path);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const items = useFilteredSessions({ projectPath: project.path, filter: "unpinned" });

  const visibleItems = expanded ? items : items.slice(0, DEFAULT_SESSION_LIMIT);
  const hiddenCount = items.length - DEFAULT_SESSION_LIMIT;

  const switchToProjectByPath = useProjectStore((s) => s.switchToProjectByPath);

  const handleActivate = useCallback(
    (sessionId: string) => {
      switchToProjectByPath(project.path);
      setActiveSession(sessionId);
    },
    [switchToProjectByPath, project.path, setActiveSession],
  ) as (sessionId: string, projectPath?: string) => void;

  const handleLoad = useCallback(
    async (sessionId: string) => {
      setRestoring(sessionId);
      try {
        switchToProjectByPath(project.path);
        await loadSession(sessionId);
      } finally {
        setRestoring((prev) => (prev === sessionId ? null : prev));
      }
    },
    [switchToProjectByPath, project.path, loadSession],
  ) as (sessionId: string, projectPath?: string) => Promise<void>;

  if (items.length === 0) {
    return sessionsLoaded ? <EmptySessionState variant="compact" /> : null;
  }

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
            onActivate={handleActivate}
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

// --- SortableProjectItem ---

const SortableProjectItem = memo(function SortableProjectItem({
  project,
  closedSet,
  onRemove,
  onCreateSession,
}: {
  project: Project;
  closedSet: Set<string>;
  onRemove: (id: string) => void;
  onCreateSession: (project: Project) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <AccordionItem ref={setNodeRef} style={style} value={project.id} className="border-b-0">
      <AccordionPrimitive.Header className="group flex justify-between items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <div
          className="flex flex-1 cursor-grab items-center gap-2 px-2 py-1.5 active:cursor-grabbing max-w-[calc(100%-50px)]"
          {...attributes}
          {...listeners}
        >
          <AccordionPrimitive.Trigger className="flex cursor-pointer items-center gap-2 text-left max-w-[calc(100%)]">
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
            <span className="flex-1 truncate text-sm font-medium max-w-[calc(100%)]">
              {project.name}
            </span>
          </AccordionPrimitive.Trigger>
        </div>
        <view className="flex">
          <button
            className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(project.id);
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
          <button
            className="mr-1 rounded p-1 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onCreateSession(project);
            }}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </view>
      </AccordionPrimitive.Header>
      <AccordionPanel className="pb-1 pt-0">
        <ProjectSessions project={project} />
      </AccordionPanel>
    </AccordionItem>
  );
});

// --- ProjectAccordionList ---

export const ProjectAccordionList = memo(function ProjectAccordionList() {
  const projects = useProjectStore((s) => s.projects);
  const closedProjectAccordions = useProjectStore((s) => s.closedProjectAccordions);
  const setClosedProjectAccordions = useProjectStore((s) => s.setClosedProjectAccordions);
  const reorderProjects = useProjectStore((s) => s.reorderProjects);
  const { removeProject, switchProject } = useProject();
  const { createNewSession } = useNewSession();
  const [activeId, setActiveId] = useState<string | null>(null);

  const closedSet = useMemo(() => new Set(closedProjectAccordions), [closedProjectAccordions]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

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
      setClosedProjectAccordions(closed);
    },
    [projects, setClosedProjectAccordions],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = projectIds.indexOf(active.id as string);
      const newIndex = projectIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newIds = [...projectIds];
      newIds.splice(oldIndex, 1);
      newIds.splice(newIndex, 0, active.id as string);
      reorderProjects(newIds);
    },
    [projectIds, reorderProjects],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
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
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
        <Accordion value={openAccordions} onValueChange={handleAccordionChange} multiple>
          {projects.map((project) => (
            <SortableProjectItem
              key={project.id}
              project={project}
              closedSet={closedSet}
              onRemove={removeProject}
              onCreateSession={handleCreateSession}
            />
          ))}
        </Accordion>
      </SortableContext>
      <DragOverlay>
        {activeProject ? (
          <div className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium shadow-md">
            <HugeiconsIcon icon={FolderIcon} size={16} strokeWidth={1.5} />
            <span className="truncate">{activeProject.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
