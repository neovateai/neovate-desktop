import { Comment01Icon, HelpCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import debug from "debug";
import { Archive, Circle, MessageCircle, Pin, PinOff } from "lucide-react";
import { memo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { TurnResult } from "../store";

import { PLAYGROUND_PROJECT_ID } from "../../../../../shared/features/project/constants";
import { Spinner } from "../../../components/ui/spinner";
import { useRelativeTime } from "../../../hooks/use-relative-time";
import { cn } from "../../../lib/utils";
import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";
import { useAgentStore } from "../store";
import { isImeComposingKeyEvent } from "../utils/keyboard";
import { SessionActionsMenu } from "./session-actions-menu";

const log = debug("neovate:session");

interface SessionItemProps {
  sessionId: string;
  title?: string;
  createdAt: string;
  isActive: boolean;
  isPinned: boolean;
  isRestoring: boolean;
  isStreaming?: boolean;
  hasPendingPermission?: boolean;
  turnResult?: TurnResult;
  /** Session has an active backend process (loaded in SessionManager) */
  isInitialized?: boolean;
  onClick: () => void;
  projectPath: string;
}

export const SessionItem = memo(function SessionItem({
  sessionId,
  title,
  createdAt,
  isActive,
  isPinned,
  isRestoring,
  isStreaming = false,
  hasPendingPermission = false,
  turnResult,
  isInitialized = false,
  onClick,
  projectPath,
}: SessionItemProps) {
  const { t } = useTranslation();
  const archiveSession = useProjectStore((s) => s.archiveSession);
  const togglePinSession = useProjectStore((s) => s.togglePinSession);
  const renameSession = useAgentStore((s) => s.renameSession);
  const sessionIsNew = useAgentStore((s) => s.sessions.get(sessionId)?.isNew ?? false);
  const multiProjectSupport = useConfigStore((s) => s.multiProjectSupport);
  const sidebarOrganize = useConfigStore((s) => s.sidebarOrganize);
  const showSessionInitStatus = useConfigStore((s) => s.showSessionInitStatus);

  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const isPlayground = useProjectStore(
    (s) => s.projects.find((p) => p.path === projectPath)?.id === PLAYGROUND_PROJECT_ID,
  );

  const displayTitle = title || t("session.newChat");
  const isProcessing = isStreaming || isRestoring;
  const relativeTime = useRelativeTime(createdAt);

  log(
    "render: sid=%s isInitialized=%s isActive=%s",
    sessionId.slice(0, 8),
    isInitialized,
    isActive,
  );

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    log("pinToggle: sid=%s isPinned=%s", sessionId, isPinned);
    togglePinSession(projectPath, sessionId);
  };

  const handleArchive = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    log("archive: sid=%s isActive=%s", sessionId, isActive);
    archiveSession(projectPath, sessionId, isActive);
    setIsConfirming(false);
  };

  const handleStartRename = () => {
    if (sessionIsNew || isEditing) return;
    setIsEditing(true);
    setEditingValue(displayTitle);
  };

  const handleSaveRename = async () => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== title) {
      log("saveRename: sid=%s title=%s", sessionId, trimmed);
      try {
        await renameSession(sessionId, trimmed);
        log("saveRename: done sid=%s", sessionId);
      } catch (error) {
        console.error("Failed to rename session:", error);
      }
    }
    setIsEditing(false);
  };

  const handleCancelRename = () => {
    setIsEditing(false);
  };

  const handleStartArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirming(true);
  };

  const handleMouseLeave = () => {
    if (isConfirming) setIsConfirming(false);
  };

  const handleDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest("button, input")) {
      return;
    }

    handleStartRename();
  };

  return (
    <li data-session-id={sessionId}>
      <SessionActionsMenu
        variant="context"
        sessionId={sessionId}
        projectPath={projectPath}
        onRenameStart={handleStartRename}
      >
        <div
          className={cn(
            "flex items-center gap-2.5 pl-2.5 pr-3 py-1 cursor-pointer rounded-lg transition-all group",
            showSessionInitStatus && "border-l-2",
            showSessionInitStatus && (isInitialized ? "border-green-500" : "border-transparent"),
            isActive
              ? "bg-primary/10 text-primary"
              : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
          )}
          onClick={onClick}
          onDoubleClick={handleDoubleClick}
          onMouseLeave={handleMouseLeave}
        >
          <button
            className="hidden group-hover:flex size-5 items-center justify-center"
            onClick={handlePinToggle}
          >
            {isPinned ? (
              <PinOff size={14} strokeWidth={1.5} />
            ) : (
              <Pin size={14} strokeWidth={1.5} />
            )}
          </button>
          <div className="flex size-5 items-center justify-center group-hover:hidden">
            {hasPendingPermission ? (
              <HugeiconsIcon
                icon={HelpCircleIcon}
                size={14}
                strokeWidth={1.5}
                className="text-warning-foreground"
              />
            ) : isProcessing ? (
              <Spinner className="size-3.5" />
            ) : turnResult ? (
              <Circle
                size={8}
                strokeWidth={0}
                fill="currentColor"
                className={turnResult === "success" ? "text-success" : "text-destructive"}
              />
            ) : isPinned ? (
              <Pin size={14} strokeWidth={1.5} />
            ) : isPlayground ? (
              <MessageCircle
                size={14}
                strokeWidth={1.5}
                className={
                  multiProjectSupport && sidebarOrganize === "byProject" ? "invisible" : undefined
                }
              />
            ) : (
              <HugeiconsIcon
                icon={Comment01Icon}
                size={14}
                strokeWidth={1.5}
                className={
                  multiProjectSupport && sidebarOrganize === "byProject" ? "invisible" : undefined
                }
              />
            )}
          </div>
          {isEditing ? (
            <input
              className="flex-1 text-sm bg-transparent border border-primary rounded px-1 py-0.5 outline-none"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={(e) => {
                if (isImeComposingKeyEvent(e.nativeEvent)) return;

                if (e.key === "Enter") {
                  handleSaveRename();
                } else if (e.key === "Escape") {
                  handleCancelRename();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <span className="flex-1 text-sm truncate text-left">
              {isRestoring ? "Restoring..." : displayTitle}
            </span>
          )}
          <span
            className={cn(
              "text-xs tabular-nums text-muted-foreground/70 group-hover:hidden",
              isConfirming && "hidden",
            )}
          >
            {relativeTime}
          </span>
          {isConfirming ? (
            <button
              className="text-xs text-destructive-foreground cursor-pointer rounded-md bg-destructive/10 px-2 py-0.5 hover:bg-destructive/20 transition-colors"
              onClick={(e) => handleArchive(e)}
            >
              {t("session.archiveConfirm")}
            </button>
          ) : (
            <button
              className="hidden group-hover:flex size-5 items-center justify-center cursor-pointer text-muted-foreground hover:text-destructive transition-colors"
              onClick={handleStartArchive}
            >
              <Archive size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </SessionActionsMenu>
    </li>
  );
});
