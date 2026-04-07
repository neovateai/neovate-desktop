import debug from "debug";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SessionInfo } from "../../../../../shared/features/agent/types";
import type { UnifiedItem } from "../hooks/use-unified-sessions";
import type { ChatSession } from "../store";

import { useOptionHeld } from "../../../hooks/use-option-held";
import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";
import { useLoadSession } from "../hooks/use-load-session";
import { useAgentStore } from "../store";
import { ChronologicalList } from "./chronological-list";
import { EmptySessionState } from "./empty-session-state";
import { PanelTriggerGroup } from "./panel-trigger-buttons";
import { PinnedSessionList } from "./pinned-session-list";
import { ProjectAccordionList } from "./project-accordion-list";
import { SidebarTitleBar } from "./sidebar-title-bar";
import { UnifiedSessionItem } from "./unified-session-item";

const log = debug("neovate:session-list");

// --- SessionList ---

export function SessionList() {
  const multiProjectSupport = useConfigStore((s) => s.multiProjectSupport);
  log("render: multiProjectSupport=%s", multiProjectSupport);

  if (multiProjectSupport) {
    return <MultiProjectSessionList />;
  }

  return <SingleProjectSessionList />;
}

// --- Multi-project mode ---

function MultiProjectSessionList() {
  const sidebarOrganize = useConfigStore((s) => s.sidebarOrganize);
  const loadSessionPreferences = useProjectStore((s) => s.loadSessionPreferences);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const optionHeld = useOptionHeld();
  const isChronological = sidebarOrganize === "chronological";
  log("multi-project: organize=%s projects=%d", sidebarOrganize, projects.length);

  useEffect(() => {
    log("multi-project: loading session preferences");
    loadSessionPreferences();
  }, [projects, loadSessionPreferences]);

  return (
    <div className="flex flex-1 flex-col pt-2">
      <PanelTriggerGroup projectPath={activeProject?.path} />
      <PinnedSessionList optionHeld={optionHeld} />
      <SidebarTitleBar />
      {isChronological ? <ChronologicalList optionHeld={optionHeld} /> : <ProjectAccordionList />}
    </div>
  );
}

// --- Single-project mode (existing behavior) ---

const SingleProjectSessionList = memo(function SingleProjectSessionList() {
  const { t } = useTranslation();
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const agentSessions = useAgentStore((s) => s.agentSessions);
  const sessionsLoaded = useAgentStore((s) => s.sessionsLoaded);

  const activeProject = useProjectStore((s) => s.activeProject);
  const archivedSessions = useProjectStore((s) => s.archivedSessions);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const loadSessionPreferences = useProjectStore((s) => s.loadSessionPreferences);

  const [restoring, setRestoring] = useState<string | null>(null);

  const projectPath = activeProject?.path;
  const loadSession = useLoadSession(projectPath);

  useEffect(() => {
    if (projectPath) {
      loadSessionPreferences();
    }
  }, [projectPath, loadSessionPreferences]);

  const handleLoad = useCallback(
    async (sessionId: string) => {
      setRestoring(sessionId);
      try {
        await loadSession(sessionId);
      } finally {
        setRestoring((prev) => (prev === sessionId ? null : prev));
      }
    },
    [loadSession],
  );

  const handleActivate = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
    },
    [setActiveSession],
  ) as (sessionId: string, projectPath?: string) => void;

  const { pinnedItems, regularItems, pinned } = useMemo(() => {
    if (!projectPath) return { pinnedItems: [], regularItems: [], pinned: new Set<string>() };

    const archived = new Set(archivedSessions[projectPath] ?? []);
    const pinnedSet = new Set(pinnedSessions[projectPath] ?? []);
    const matchesProject = (cwd?: string) => cwd?.startsWith(projectPath) ?? false;

    const loadedIds = new Set(sessions.keys());

    const allInMemory = (Array.from(sessions.values()) as ChatSession[]).filter(
      (s) => matchesProject(s.cwd) && !archived.has(s.sessionId) && !s.isNew,
    );

    const allPersisted = agentSessions.filter(
      (s) => !loadedIds.has(s.sessionId) && matchesProject(s.cwd) && !archived.has(s.sessionId),
    );

    const toUnified = (items: ChatSession[], persisted: SessionInfo[]): UnifiedItem[] => {
      const mem: UnifiedItem[] = items.map((s) => ({
        kind: "memory",
        session: s,
        projectPath,
      }));
      const per: UnifiedItem[] = persisted.map((s) => ({
        kind: "persisted",
        info: s,
        projectPath,
      }));
      return [...mem, ...per].sort((a, b) => {
        const aDate = a.kind === "memory" ? a.session.createdAt : a.info.createdAt;
        const bDate = b.kind === "memory" ? b.session.createdAt : b.info.createdAt;
        return bDate.localeCompare(aDate);
      });
    };

    return {
      pinnedItems: toUnified(
        allInMemory.filter((s) => pinnedSet.has(s.sessionId)),
        allPersisted.filter((s) => pinnedSet.has(s.sessionId)),
      ),
      regularItems: toUnified(
        allInMemory.filter((s) => !pinnedSet.has(s.sessionId)),
        allPersisted.filter((s) => !pinnedSet.has(s.sessionId)),
      ),
      pinned: pinnedSet,
    };
  }, [sessions, agentSessions, archivedSessions, pinnedSessions, projectPath]);

  if (!activeProject || !projectPath) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">{t("session.selectProject")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1 pt-2">
      <PanelTriggerGroup projectPath={projectPath} />
      {pinnedItems.length === 0 && regularItems.length === 0 ? (
        sessionsLoaded ? (
          <EmptySessionState />
        ) : null
      ) : (
        <ul className="flex flex-col gap-1">
          {pinnedItems.length > 0 && (
            <>
              {pinnedItems.map((item) => {
                const id = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
                return (
                  <UnifiedSessionItem
                    key={id}
                    item={item}
                    activeSessionId={activeSessionId}
                    isPinned={true}
                    restoring={restoring}
                    onActivate={handleActivate}
                    onLoad={handleLoad}
                  />
                );
              })}
            </>
          )}
          {regularItems.map((item) => {
            const id = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
            return (
              <UnifiedSessionItem
                key={id}
                item={item}
                activeSessionId={activeSessionId}
                isPinned={pinned.has(id)}
                restoring={restoring}
                onActivate={handleActivate}
                onLoad={handleLoad}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
});
