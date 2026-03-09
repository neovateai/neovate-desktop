import debug from "debug";
import { memo, useMemo } from "react";
import { useAgentStore } from "../store";

const log = debug("neovate:pinned-session-list");
import { useProjectStore } from "../../project/store";
import { useConfigStore } from "../../config/store";
import { useLoadSession } from "../hooks/use-load-session";
import { SessionItem } from "./session-item";
import type { ChatSession } from "../store";
import type { SessionInfo } from "../../../../../shared/features/agent/types";

type UnifiedItem =
  | { kind: "memory"; session: ChatSession }
  | { kind: "persisted"; info: SessionInfo };

export const PinnedSessionList = memo(function PinnedSessionList() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const agentSessions = useAgentStore((s) => s.agentSessions);

  const projects = useProjectStore((s) => s.projects);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const archivedSessions = useProjectStore((s) => s.archivedSessions);

  const sidebarSortBy = useConfigStore((s) => s.sidebarSortBy);

  // We need a project path for loadSession — use the first project as fallback
  const firstProjectPath = projects[0]?.path;
  const loadSession = useLoadSession(firstProjectPath);

  const pinnedItems = useMemo(() => {
    const allPinnedIds = new Set<string>();
    for (const ids of Object.values(pinnedSessions)) {
      for (const id of ids) allPinnedIds.add(id);
    }
    if (allPinnedIds.size === 0) return [];

    const archivedIds = new Set<string>();
    for (const ids of Object.values(archivedSessions)) {
      for (const id of ids) archivedIds.add(id);
    }

    const loadedIds = new Set(sessions.keys());

    const memItems: UnifiedItem[] = [];
    for (const [, session] of sessions) {
      if (
        allPinnedIds.has(session.sessionId) &&
        !archivedIds.has(session.sessionId) &&
        !session.isNew
      ) {
        memItems.push({ kind: "memory", session });
      }
    }

    const perItems: UnifiedItem[] = agentSessions
      .filter(
        (s) =>
          !loadedIds.has(s.sessionId) &&
          allPinnedIds.has(s.sessionId) &&
          !archivedIds.has(s.sessionId),
      )
      .map((info) => ({ kind: "persisted", info }));

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
  }, [sessions, agentSessions, pinnedSessions, archivedSessions, sidebarSortBy]);

  log("render: pinnedCount=%d", pinnedItems.length);

  if (pinnedItems.length === 0) return null;

  // Find the project path for a given session
  const getProjectPath = (cwd?: string): string => {
    if (!cwd) return firstProjectPath ?? "";
    const project = projects.find((p) => cwd.startsWith(p.path));
    return project?.path ?? firstProjectPath ?? "";
  };

  return (
    <div className="px-2 pb-2">
      <div className="px-2 pb-1">
        <span className="text-[10px] font-medium text-muted-foreground">Pinned</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {pinnedItems.map((item) => {
          if (item.kind === "memory") {
            const s = item.session;
            return (
              <SessionItem
                key={s.sessionId}
                sessionId={s.sessionId}
                title={s.title}
                createdAt={s.createdAt}
                isActive={s.sessionId === activeSessionId}
                isPinned
                isRestoring={false}
                isStreaming={s.streaming}
                hasPendingPermission={s.pendingPermission !== null}
                onClick={() => setActiveSession(s.sessionId)}
                projectPath={getProjectPath(s.cwd)}
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
              isPinned
              isRestoring={false}
              onClick={() => loadSession(info.sessionId)}
              projectPath={getProjectPath(info.cwd)}
            />
          );
        })}
      </ul>
    </div>
  );
});
