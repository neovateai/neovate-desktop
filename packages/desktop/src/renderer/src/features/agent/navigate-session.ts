import debug from "debug";

import type { SessionInfo } from "../../../../shared/features/agent/types";
import type { ChatSession } from "./store";

import { useConfigStore } from "../config/store";
import { useProjectStore } from "../project/store";
import { claudeCodeChatManager } from "./chat-manager";
import { useAgentStore } from "./store";

const log = debug("neovate:session:navigate");

type SessionEntry =
  | { kind: "memory"; sessionId: string; session: ChatSession; projectPath: string }
  | { kind: "persisted"; sessionId: string; info: SessionInfo; projectPath: string };

/** Guard: skip navigation if a persisted session load is already in flight */
let loadInFlight = false;

function scrollToSession(sessionId: string): void {
  // Small delay to let React render the new active state
  setTimeout(() => {
    const el = document.querySelector(`[data-session-id="${sessionId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

/**
 * Navigate to the previous or next session in the sidebar.
 * Behavior varies by mode:
 * - single-project: cycles sessions for the active project (pinned first, then regular)
 * - byProject: cycles active project's unpinned + cross-project pinned (matching sidebar layout)
 * - chronological: cycles all sessions across all projects
 */
export function navigateSession(direction: "prev" | "next"): void {
  if (loadInFlight) return;

  const { multiProjectSupport, sidebarOrganize, sidebarSortBy } = useConfigStore.getState();
  const { sessions, agentSessions, activeSessionId, setActiveSession, createSession } =
    useAgentStore.getState();
  const { pinnedSessions, archivedSessions, projects, activeProject, switchToProjectByPath } =
    useProjectStore.getState();

  if (!activeProject) return;

  const isByProject = multiProjectSupport && sidebarOrganize === "byProject";
  const isChronological = multiProjectSupport && sidebarOrganize === "chronological";

  // Determine scope paths for session matching
  // - single-project: active project only
  // - byProject: active project for unpinned, all projects for pinned
  // - chronological: all projects
  const allProjectPaths = projects.filter((p) => !p.pathMissing).map((p) => p.path);
  const scopePaths = isChronological || isByProject ? allProjectPaths : [activeProject.path];

  const matchesScope = (cwd?: string) => {
    if (!cwd) return false;
    return scopePaths.some((p) => cwd.startsWith(p));
  };

  const matchesActiveProject = (cwd?: string) => {
    if (!cwd) return false;
    return cwd.startsWith(activeProject.path);
  };

  // Build pinned/archived sets
  // In byProject mode: pinned set is cross-project (matches PinnedSessionList)
  // In other modes: pinned set is scoped to scopePaths
  const pinnedIds = new Set<string>();
  const archivedIds = new Set<string>();
  const pinnedPaths = isByProject || isChronological ? allProjectPaths : [activeProject.path];
  for (const path of pinnedPaths) {
    for (const id of pinnedSessions[path] ?? []) pinnedIds.add(id);
  }
  for (const path of scopePaths) {
    for (const id of archivedSessions[path] ?? []) archivedIds.add(id);
  }

  const loadedIds = new Set(sessions.keys());

  const resolveProjectPath = (cwd?: string): string => {
    if (!cwd) return activeProject.path;
    if (!multiProjectSupport) return activeProject.path;
    const match = projects.find((p) => cwd.startsWith(p.path));
    return match?.path ?? activeProject.path;
  };

  // Collect sessions into pinned and unpinned groups
  const pinnedItems: SessionEntry[] = [];
  const unpinnedItems: SessionEntry[] = [];

  for (const [, session] of sessions) {
    if (archivedIds.has(session.sessionId) || session.isNew) continue;

    const isPinned = pinnedIds.has(session.sessionId);

    if (isPinned) {
      // Pinned: must match scope (all projects in byProject/chronological, active in single)
      if (!matchesScope(session.cwd)) continue;
    } else {
      // Unpinned: in byProject mode, only include active project's sessions
      if (isByProject) {
        if (!matchesActiveProject(session.cwd)) continue;
      } else {
        if (!matchesScope(session.cwd)) continue;
      }
    }

    const entry: SessionEntry = {
      kind: "memory",
      sessionId: session.sessionId,
      session,
      projectPath: resolveProjectPath(session.cwd),
    };
    if (isPinned) {
      pinnedItems.push(entry);
    } else {
      unpinnedItems.push(entry);
    }
  }

  for (const info of agentSessions) {
    if (loadedIds.has(info.sessionId) || archivedIds.has(info.sessionId)) continue;

    const isPinned = pinnedIds.has(info.sessionId);

    if (isPinned) {
      if (!matchesScope(info.cwd)) continue;
    } else {
      if (isByProject) {
        if (!matchesActiveProject(info.cwd)) continue;
      } else {
        if (!matchesScope(info.cwd)) continue;
      }
    }

    const entry: SessionEntry = {
      kind: "persisted",
      sessionId: info.sessionId,
      info,
      projectPath: resolveProjectPath(info.cwd),
    };
    if (isPinned) {
      pinnedItems.push(entry);
    } else {
      unpinnedItems.push(entry);
    }
  }

  // Sort each group by date descending (newest first)
  // Single-project mode always uses createdAt (matching SingleProjectSessionList behavior)
  const getDate = (entry: SessionEntry) => {
    if (entry.kind === "memory") return entry.session.createdAt;
    if (!multiProjectSupport || sidebarSortBy !== "updated") return entry.info.createdAt;
    return entry.info.updatedAt;
  };

  pinnedItems.sort((a, b) => getDate(b).localeCompare(getDate(a)));
  unpinnedItems.sort((a, b) => getDate(b).localeCompare(getDate(a)));

  // Flat ordered list: pinned first, then unpinned (matches sidebar visual order)
  // Filter to only sessions currently rendered in the DOM (respects "show more" pagination)
  const renderedIds = new Set(
    Array.from(document.querySelectorAll<HTMLElement>("[data-session-id]")).map(
      (el) => el.dataset.sessionId,
    ),
  );
  const all = [...pinnedItems, ...unpinnedItems].filter((s) => renderedIds.has(s.sessionId));
  if (all.length <= 1) return;

  // Find current and compute target with circular wrapping
  const currentIndex = all.findIndex((s) => s.sessionId === activeSessionId);
  const start = currentIndex === -1 ? 0 : currentIndex;
  const delta = direction === "next" ? 1 : -1;
  const targetIndex = (start + delta + all.length) % all.length;
  const target = all[targetIndex];

  log("%s session: %s → %s", direction, activeSessionId?.slice(0, 8), target.sessionId.slice(0, 8));

  // Switch project if needed (multi-project modes can cross projects)
  if (multiProjectSupport && target.projectPath !== activeProject.path) {
    switchToProjectByPath(target.projectPath);
  }

  // Activate target
  if (target.kind === "memory" || claudeCodeChatManager.getChat(target.sessionId)) {
    setActiveSession(target.sessionId);
    scrollToSession(target.sessionId);
  } else {
    // Load persisted session from disk
    loadInFlight = true;
    const cwd = target.info.cwd ?? target.projectPath;
    claudeCodeChatManager
      .loadSession(target.sessionId, cwd)
      .then(({ commands, models, currentModel, modelScope, providerId }) => {
        createSession(target.sessionId, {
          title: target.info.title,
          createdAt: target.info.createdAt,
          cwd: target.info.cwd,
        });
        const store = useAgentStore.getState();
        if (commands?.length) store.setAvailableCommands(target.sessionId, commands);
        if (models?.length) store.setAvailableModels(target.sessionId, models);
        if (currentModel) store.setCurrentModel(target.sessionId, currentModel);
        if (modelScope) store.setModelScope(target.sessionId, modelScope);
        if (providerId) store.setProviderId(target.sessionId, providerId);
        scrollToSession(target.sessionId);
      })
      .catch(() => {
        useAgentStore.getState().removeSession(target.sessionId);
      })
      .finally(() => {
        loadInFlight = false;
      });
  }
}
