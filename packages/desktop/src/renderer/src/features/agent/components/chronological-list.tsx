import debug from "debug";
import { memo, useCallback, useState } from "react";

import { useProjectStore } from "../../project/store";
import { useLoadSession } from "../hooks/use-load-session";
import { useFilteredSessions } from "../hooks/use-unified-sessions";
import { useAgentStore } from "../store";
import { EmptySessionState } from "./empty-session-state";
import { UnifiedSessionItem } from "./unified-session-item";

const log = debug("neovate:chronological-list");

const CHRONOLOGICAL_SESSION_LIMIT = 50;

export const ChronologicalList = memo(function ChronologicalList() {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const loadSession = useLoadSession();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sessionsLoaded = useAgentStore((s) => s.sessionsLoaded);

  const items = useFilteredSessions({ filter: "unpinned" });

  log("render: totalItems=%d", items.length);

  const visibleItems = showAll ? items : items.slice(0, CHRONOLOGICAL_SESSION_LIMIT);
  const hiddenCount = items.length - CHRONOLOGICAL_SESSION_LIMIT;

  const switchToProjectByPath = useProjectStore((s) => s.switchToProjectByPath);

  const handleActivate = useCallback(
    (sessionId: string, projectPath?: string) => {
      if (projectPath) switchToProjectByPath(projectPath);
      setActiveSession(sessionId);
    },
    [switchToProjectByPath, setActiveSession],
  );

  const handleLoad = useCallback(
    async (sessionId: string, projectPath?: string) => {
      setRestoring(sessionId);
      try {
        if (projectPath) switchToProjectByPath(projectPath);
        await loadSession(sessionId);
      } finally {
        setRestoring((prev) => (prev === sessionId ? null : prev));
      }
    },
    [switchToProjectByPath, loadSession],
  );

  if (items.length === 0) {
    return sessionsLoaded ? <EmptySessionState /> : null;
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
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </ul>
  );
});
