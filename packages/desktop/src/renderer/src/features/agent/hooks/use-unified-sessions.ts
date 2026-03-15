import { useMemo, useRef } from "react";

import type { SessionInfo } from "../../../../../shared/features/agent/types";
import type { ChatSession } from "../store";

import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";
import { useAgentStore } from "../store";

export type UnifiedItem =
  | { kind: "memory"; session: ChatSession; projectPath: string }
  | { kind: "persisted"; info: SessionInfo; projectPath: string };

/** Returns true when session metadata relevant to the list hasn't changed. */
function sessionsMetaEqual(a: Map<string, ChatSession>, b: Map<string, ChatSession>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, sa] of a) {
    const sb = b.get(id);
    if (
      !sb ||
      sa.sessionId !== sb.sessionId ||
      sa.cwd !== sb.cwd ||
      sa.title !== sb.title ||
      sa.createdAt !== sb.createdAt ||
      sa.isNew !== sb.isNew
    )
      return false;
  }
  return true;
}

/**
 * Returns a referentially stable `sessions` Map that only changes when
 * session metadata (id, cwd, title, createdAt, isNew) actually differs.
 * This prevents the downstream useMemo from recomputing on every chat message.
 */
function useStableSessions(): Map<string, ChatSession> {
  const sessions = useAgentStore((s) => s.sessions);
  const ref = useRef(sessions);
  if (!sessionsMetaEqual(ref.current, sessions)) {
    ref.current = sessions;
  }
  return ref.current;
}

interface UseFilteredSessionsOptions {
  /** Filter to a specific project path. If omitted, includes all registered projects. */
  projectPath?: string;
  /** "pinned" returns only pinned sessions, "unpinned" excludes them. */
  filter: "pinned" | "unpinned";
}

export function useFilteredSessions({
  projectPath,
  filter,
}: UseFilteredSessionsOptions): UnifiedItem[] {
  const sessions = useStableSessions();
  const agentSessions = useAgentStore((s) => s.agentSessions);
  const projects = useProjectStore((s) => s.projects);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const archivedSessions = useProjectStore((s) => s.archivedSessions);
  const sidebarSortBy = useConfigStore((s) => s.sidebarSortBy);

  return useMemo(() => {
    // Build global pinned/archived sets
    const allPinnedIds = new Set<string>();
    for (const ids of Object.values(pinnedSessions)) {
      for (const id of ids) allPinnedIds.add(id);
    }
    const allArchivedIds = new Set<string>();
    for (const ids of Object.values(archivedSessions)) {
      for (const id of ids) allArchivedIds.add(id);
    }

    // Scope matching
    const scopePaths = projectPath ? [projectPath] : projects.map((p) => p.path);
    const matchesScope = (cwd?: string) => {
      if (!cwd) return false;
      return scopePaths.some((p) => cwd.startsWith(p));
    };

    const resolveProjectPath = (cwd?: string): string => {
      if (projectPath) return projectPath;
      if (!cwd) return projects[0]?.path ?? "";
      const match = projects.find((p) => cwd.startsWith(p.path));
      return match?.path ?? projects[0]?.path ?? "";
    };

    // Pinned/archived checks: project-scoped when projectPath is set, global otherwise
    const isPinned = (id: string) =>
      projectPath ? (pinnedSessions[projectPath] ?? []).includes(id) : allPinnedIds.has(id);

    const isArchived = (id: string) =>
      projectPath ? (archivedSessions[projectPath] ?? []).includes(id) : allArchivedIds.has(id);

    const matchesFilter = (id: string) => (filter === "pinned" ? isPinned(id) : !isPinned(id));

    const loadedIds = new Set(sessions.keys());

    const memItems: UnifiedItem[] = [];
    for (const [, session] of sessions) {
      if (
        matchesScope(session.cwd) &&
        !isArchived(session.sessionId) &&
        matchesFilter(session.sessionId) &&
        !session.isNew
      ) {
        memItems.push({ kind: "memory", session, projectPath: resolveProjectPath(session.cwd) });
      }
    }

    const perItems: UnifiedItem[] = agentSessions
      .filter(
        (s) =>
          !loadedIds.has(s.sessionId) &&
          matchesScope(s.cwd) &&
          !isArchived(s.sessionId) &&
          matchesFilter(s.sessionId),
      )
      .map((info) => ({ kind: "persisted", info, projectPath: resolveProjectPath(info.cwd) }));

    const all = [...memItems, ...perItems];
    all.sort((a, b) => {
      const getDate = (item: UnifiedItem) =>
        item.kind === "memory"
          ? item.session.createdAt
          : sidebarSortBy === "updated"
            ? item.info.updatedAt
            : item.info.createdAt;
      return getDate(b).localeCompare(getDate(a));
    });

    return all;
  }, [
    sessions,
    agentSessions,
    projects,
    pinnedSessions,
    archivedSessions,
    sidebarSortBy,
    projectPath,
    filter,
  ]);
}
