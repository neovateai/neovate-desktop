import { memo } from "react";
import { SessionItem } from "./session-item";
import type { UnifiedItem } from "../hooks/use-unified-sessions";

interface UnifiedSessionItemProps {
  item: UnifiedItem;
  activeSessionId: string | null;
  isPinned: boolean;
  restoring: string | null;
  onActivate: (sessionId: string) => void;
  onLoad: (sessionId: string) => void;
  onAfterArchive?: () => void;
}

export const UnifiedSessionItem = memo(function UnifiedSessionItem({
  item,
  activeSessionId,
  isPinned,
  restoring,
  onActivate,
  onLoad,
  onAfterArchive,
}: UnifiedSessionItemProps) {
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
        isStreaming={s.streaming}
        hasPendingPermission={s.pendingPermission !== null}
        onClick={() => onActivate(s.sessionId)}
        onAfterArchive={onAfterArchive}
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
      onClick={() => onLoad(info.sessionId)}
      onAfterArchive={onAfterArchive}
      projectPath={item.projectPath}
    />
  );
});
