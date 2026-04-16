import debug from "debug";
import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLayoutStore } from "../../../components/app-layout/store";
import { useOptionHeld } from "../../../hooks/use-option-held";
import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";
import { useLoadSession } from "../hooks/use-load-session";
import { useFilteredSessions } from "../hooks/use-unified-sessions";
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
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar.collapsed);
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

  // Don't mount session list when sidebar is collapsed — eliminates all subscriptions
  if (collapsed) return null;

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
  const collapsed = useLayoutStore((s) => s.panels.primarySidebar.collapsed);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const sessionsLoaded = useAgentStore((s) => s.sessionsLoaded);

  const activeProject = useProjectStore((s) => s.activeProject);
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
  ) as (sessionId: string, projectPath?: string) => Promise<void>;

  const handleActivate = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
    },
    [setActiveSession],
  ) as (sessionId: string, projectPath?: string) => void;

  const pinnedItems = useFilteredSessions({
    projectPath: projectPath ?? undefined,
    filter: "pinned",
  });
  const regularItems = useFilteredSessions({
    projectPath: projectPath ?? undefined,
    filter: "unpinned",
  });

  if (!activeProject || !projectPath) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">{t("session.selectProject")}</p>
      </div>
    );
  }

  // Don't mount session list when sidebar is collapsed
  if (collapsed) return null;

  return (
    <div className="flex flex-1 flex-col gap-1 pt-2">
      <PanelTriggerGroup projectPath={projectPath} />
      {pinnedItems.length === 0 && regularItems.length === 0 ? (
        sessionsLoaded ? (
          <EmptySessionState />
        ) : null
      ) : (
        <ul className="flex flex-col gap-1">
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
          {regularItems.map((item) => {
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
        </ul>
      )}
    </div>
  );
});
