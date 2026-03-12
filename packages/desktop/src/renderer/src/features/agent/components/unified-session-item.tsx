import { memo } from "react";

import type { UnifiedItem } from "../hooks/use-unified-sessions";
import type { TurnResult } from "../store";

import { useSessionChatStatus } from "../hooks/use-session-chat-status";
import { useAgentStore } from "../store";
import { SessionItem } from "./session-item";

interface UnifiedSessionItemProps {
  item: UnifiedItem;
  activeSessionId: string | null;
  isPinned: boolean;
  restoring: string | null;
  onActivate: (sessionId: string) => void;
  onLoad: (sessionId: string) => void;
}

export const UnifiedSessionItem = memo(function UnifiedSessionItem({
  item,
  activeSessionId,
  isPinned,
  restoring,
  onActivate,
  onLoad,
}: UnifiedSessionItemProps) {
  const sessionId = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
  const { isStreaming, hasPendingRequests } = useSessionChatStatus(sessionId);
  const turnResult = useAgentStore((s) => s.unseenTurnResults.get(sessionId)) as
    | TurnResult
    | undefined;

  if (item.kind === "memory") {
    const s = item.session;
    return (
      <SessionItem
        sessionId={s.sessionId}
        title={s.title}
        createdAt={s.createdAt}
        isActive={s.sessionId === activeSessionId}
        isPinned={isPinned}
        isRestoring={false}
        isStreaming={isStreaming}
        hasPendingPermission={hasPendingRequests}
        turnResult={turnResult}
        onClick={() => onActivate(s.sessionId)}
        projectPath={item.projectPath}
      />
    );
  }
  const info = item.info;
  return (
    <SessionItem
      sessionId={info.sessionId}
      title={info.title}
      createdAt={info.createdAt}
      isActive={false}
      isPinned={isPinned}
      isRestoring={restoring === info.sessionId}
      isStreaming={isStreaming}
      hasPendingPermission={hasPendingRequests}
      turnResult={turnResult}
      onClick={() => onLoad(info.sessionId)}
      projectPath={item.projectPath}
    />
  );
});
