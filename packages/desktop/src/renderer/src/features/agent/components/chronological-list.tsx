import debug from "debug";
import { memo, useMemo, useState } from "react";
import { useAgentStore } from "../store";

const log = debug("neovate:chronological-list");
import { useProjectStore } from "../../project/store";
import { useConfigStore } from "../../config/store";
import { useLoadSession } from "../hooks/use-load-session";
import { SessionItem } from "./session-item";
import type { ChatSession } from "../store";
import type { SessionInfo } from "../../../../../shared/features/agent/types";

const CHRONOLOGICAL_SESSION_LIMIT = 50;

type UnifiedItem =
  | { kind: "memory"; session: ChatSession; projectPath: string }
  | { kind: "persisted"; info: SessionInfo; projectPath: string };

export const ChronologicalList = memo(function ChronologicalList() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const agentSessions = useAgentStore((s) => s.agentSessions);

  const projects = useProjectStore((s) => s.projects);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const archivedSessions = useProjectStore((s) => s.archivedSessions);

  const sidebarSortBy = useConfigStore((s) => s.sidebarSortBy);

  const firstProjectPath = projects[0]?.path;
  const loadSession = useLoadSession(firstProjectPath);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const findProjectPath = (cwd?: string): string => {
    if (!cwd) return firstProjectPath ?? "";
    const project = projects.find((p) => cwd.startsWith(p.path));
    return project?.path ?? firstProjectPath ?? "";
  };

  const items = useMemo(() => {
    const allPinnedIds = new Set<string>();
    for (const ids of Object.values(pinnedSessions)) {
      for (const id of ids) allPinnedIds.add(id);
    }
    const allArchivedIds = new Set<string>();
    for (const ids of Object.values(archivedSessions)) {
      for (const id of ids) allArchivedIds.add(id);
    }

    const projectPaths = new Set(projects.map((p) => p.path));
    const matchesAnyProject = (cwd?: string) => {
      if (!cwd) return false;
      for (const path of projectPaths) {
        if (cwd.startsWith(path)) return true;
      }
      return false;
    };

    const loadedIds = new Set(sessions.keys());

    const memItems: UnifiedItem[] = [];
    for (const [, session] of sessions) {
      if (
        matchesAnyProject(session.cwd) &&
        !allArchivedIds.has(session.sessionId) &&
        !allPinnedIds.has(session.sessionId) &&
        !session.isNew
      ) {
        memItems.push({ kind: "memory", session, projectPath: findProjectPath(session.cwd) });
      }
    }

    const perItems: UnifiedItem[] = agentSessions
      .filter(
        (s) =>
          !loadedIds.has(s.sessionId) &&
          matchesAnyProject(s.cwd) &&
          !allArchivedIds.has(s.sessionId) &&
          !allPinnedIds.has(s.sessionId),
      )
      .map((info) => ({ kind: "persisted", info, projectPath: findProjectPath(info.cwd) }));

    const all = [...memItems, ...perItems];
    all.sort((a, b) => {
      const aDate =
        a.kind === "memory"
          ? a.session.createdAt
          : sidebarSortBy === "updated"
            ? a.info.updatedAt
            : a.info.createdAt;
      const bDate =
        b.kind === "memory"
          ? b.session.createdAt
          : sidebarSortBy === "updated"
            ? b.info.updatedAt
            : b.info.createdAt;
      return bDate.localeCompare(aDate);
    });

    return all;
  }, [sessions, agentSessions, projects, pinnedSessions, archivedSessions, sidebarSortBy]);

  log("render: totalItems=%d sortBy=%s", items.length, sidebarSortBy);

  const visibleItems = showAll ? items : items.slice(0, CHRONOLOGICAL_SESSION_LIMIT);
  const hiddenCount = items.length - CHRONOLOGICAL_SESSION_LIMIT;

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
        if (item.kind === "memory") {
          const s = item.session;
          return (
            <SessionItem
              key={s.sessionId}
              sessionId={s.sessionId}
              title={s.title}
              createdAt={s.createdAt}
              isActive={s.sessionId === activeSessionId}
              isPinned={false}
              isRestoring={false}
              isStreaming={s.streaming}
              hasPendingPermission={s.pendingPermission !== null}
              onClick={() => setActiveSession(s.sessionId)}
              projectPath={item.projectPath}
            />
          );
        }
        const info = item.info;
        return (
          <SessionItem
            key={info.sessionId}
            sessionId={info.sessionId}
            title={info.title}
            createdAt={info.createdAt}
            isActive={false}
            isPinned={false}
            isRestoring={restoring === info.sessionId}
            onClick={() => handleLoad(info.sessionId)}
            projectPath={item.projectPath}
          />
        );
      })}
      {hiddenCount > 0 && (
        <button
          className="cursor-pointer px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </ul>
  );
});
