import { Comment01Icon, HelpCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistanceToNowStrict } from "date-fns";
import { Archive, Pin, PinOff } from "lucide-react";
import { memo, useState } from "react";
import { cn } from "../../../lib/utils";
import { Spinner } from "../../../components/ui/spinner";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { useConfigStore } from "../../config/store";
import { SessionActionsMenu } from "./session-actions-menu";

function formatRelativeTime(iso: string): string {
  const distance = formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
  return distance
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

interface SessionItemProps {
  sessionId: string;
  title?: string;
  createdAt: string;
  isActive: boolean;
  isPinned: boolean;
  isRestoring: boolean;
  isStreaming?: boolean;
  hasPendingPermission?: boolean;
  onClick: () => void;
  onAfterArchive?: () => void;
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
  onClick,
  onAfterArchive,
  projectPath,
}: SessionItemProps) {
  const archiveSession = useProjectStore((s) => s.archiveSession);
  const togglePinSession = useProjectStore((s) => s.togglePinSession);
  const renameSession = useAgentStore((s) => s.renameSession);
  const multiProjectSupport = useConfigStore((s) => s.multiProjectSupport);
  const sidebarOrganize = useConfigStore((s) => s.sidebarOrganize);

  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const displayTitle = title || sessionId.slice(0, 8);
  const isProcessing = isStreaming || isRestoring;

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePinSession(projectPath, sessionId);
  };

  const handleArchive = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    archiveSession(projectPath, sessionId);
    setIsConfirming(false);
    if (isActive) onAfterArchive?.();
  };

  const handleStartRename = () => {
    setIsEditing(true);
    setEditingValue(displayTitle);
  };

  const handleSaveRename = async () => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== title) {
      try {
        await renameSession(sessionId, trimmed);
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

  return (
    <li>
      <SessionActionsMenu
        variant="context"
        sessionId={sessionId}
        projectPath={projectPath}
        onRenameStart={handleStartRename}
        onAfterArchive={() => {
          if (isActive) onAfterArchive?.();
        }}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 mb-1 cursor-pointer rounded transition-colors group",
            isActive
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={onClick}
          onMouseLeave={handleMouseLeave}
        >
          <button className="hidden group-hover:block" onClick={handlePinToggle}>
            {isPinned ? (
              <PinOff size={14} strokeWidth={1.5} />
            ) : (
              <Pin size={14} strokeWidth={1.5} />
            )}
          </button>
          <div className="group-hover:hidden">
            {hasPendingPermission ? (
              <HugeiconsIcon
                icon={HelpCircleIcon}
                size={14}
                strokeWidth={1.5}
                className="text-warning-foreground"
              />
            ) : isProcessing ? (
              <Spinner className="size-3.5" />
            ) : isPinned ? (
              <Pin size={14} strokeWidth={1.5} />
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
            <span className="flex-1 text-sm truncate">
              {isRestoring ? "Restoring..." : displayTitle}
            </span>
          )}
          <span
            className={cn(
              "text-sm text-muted-foreground group-hover:hidden",
              isConfirming && "hidden",
            )}
          >
            {formatRelativeTime(createdAt)}
          </span>
          {isConfirming ? (
            <button
              className="text-xs text-destructive cursor-pointer rounded bg-muted px-2 py-0.5 hover:bg-destructive/10 transition-colors"
              onClick={(e) => handleArchive(e)}
            >
              Confirm
            </button>
          ) : (
            <button
              className="hidden group-hover:block cursor-pointer text-muted-foreground hover:text-destructive transition-colors"
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
