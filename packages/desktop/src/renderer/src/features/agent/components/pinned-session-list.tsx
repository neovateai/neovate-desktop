import debug from "debug";
import { memo, useCallback, useState } from "react";

import { useProjectStore } from "../../project/store";
import { useLoadSession } from "../hooks/use-load-session";
import { useFilteredSessions } from "../hooks/use-unified-sessions";
import { useAgentStore } from "../store";
import { UnifiedSessionItem } from "./unified-session-item";

const log = debug("neovate:pinned-session-list");

export const PinnedSessionList = memo(function PinnedSessionList() {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const loadSession = useLoadSession();
  const [restoring, setRestoring] = useState<string | null>(null);

  const switchToProjectByPath = useProjectStore((s) => s.switchToProjectByPath);
  const items = useFilteredSessions({ filter: "pinned" });

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

  log("render: pinnedCount=%d", items.length);

  if (items.length === 0) return null;

  return (
    <div className="pb-2">
      <ul className="flex flex-col">
        {items.map((item) => {
          const id = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
          return (
            <UnifiedSessionItem
              key={id}
              item={item}
              activeSessionId={activeSessionId}
              isPinned
              restoring={restoring}
              onActivate={handleActivate}
              onLoad={handleLoad}
            />
          );
        })}
      </ul>
    </div>
  );
});
