import { memo, useCallback } from "react";

import type { UnifiedItem } from "../hooks/use-unified-sessions";
import type { TurnResult } from "../store";

import { layoutStore } from "../../../components/app-layout/store";
import { useSessionChatStatus } from "../hooks/use-session-chat-status";
import { useAgentStore } from "../store";
import { SessionItem } from "./session-item";

interface UnifiedSessionItemProps {
  item: UnifiedItem;
  activeSessionId: string | null;
  isPinned: boolean;
  restoring: string | null;
  onActivate: (sessionId: string, projectPath: string) => void;
  onLoad: (sessionId: string, projectPath: string) => void;
}

export const UnifiedSessionItem = memo(
  function UnifiedSessionItem({
    item,
    activeSessionId,
    isPinned,
    restoring,
    onActivate,
    onLoad,
  }: UnifiedSessionItemProps) {
    const sessionId = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
    const title = item.kind === "memory" ? item.session.title : item.info.title;
    const createdAt = item.kind === "memory" ? item.session.createdAt : item.info.createdAt;
    const { isStreaming, hasPendingRequests } = useSessionChatStatus(sessionId);
    const turnResult = useAgentStore((s) => s.unseenTurnResults.get(sessionId)) as
      | TurnResult
      | undefined;

    const isActive = item.kind === "memory" && sessionId === activeSessionId;
    const isRestoring = item.kind === "persisted" && restoring === sessionId;

    const handleClick = useCallback(() => {
      layoutStore.getState().closeFullRightPanel();
      if (item.kind === "memory") {
        onActivate(sessionId, item.projectPath);
      } else {
        onLoad(sessionId, item.projectPath);
      }
    }, [item.kind, item.projectPath, sessionId, onActivate, onLoad]);

    return (
      <SessionItem
        sessionId={sessionId}
        title={title}
        createdAt={createdAt}
        isActive={isActive}
        isPinned={isPinned}
        isRestoring={isRestoring}
        isStreaming={isStreaming}
        hasPendingPermission={hasPendingRequests}
        turnResult={turnResult}
        isInitialized={item.kind === "memory"}
        onClick={handleClick}
        projectPath={item.projectPath}
      />
    );
  },
  (prev, next) =>
    prev.activeSessionId === next.activeSessionId &&
    prev.isPinned === next.isPinned &&
    prev.restoring === next.restoring &&
    prev.onActivate === next.onActivate &&
    prev.onLoad === next.onLoad &&
    prev.item.projectPath === next.item.projectPath &&
    itemId(prev.item) === itemId(next.item) &&
    itemTitle(prev.item) === itemTitle(next.item) &&
    itemCreatedAt(prev.item) === itemCreatedAt(next.item) &&
    prev.item.kind === next.item.kind,
);

function itemId(item: UnifiedItem) {
  return item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
}
function itemTitle(item: UnifiedItem) {
  return item.kind === "memory" ? item.session.title : item.info.title;
}
function itemCreatedAt(item: UnifiedItem) {
  return item.kind === "memory" ? item.session.createdAt : item.info.createdAt;
}
