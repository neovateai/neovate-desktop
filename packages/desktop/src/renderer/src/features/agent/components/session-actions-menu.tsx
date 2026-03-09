import debug from "debug";
import { MoreHorizontal } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { Button } from "../../../components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../../../components/ui/menu";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu";

const log = debug("neovate:session-actions-menu");

interface SessionActionsMenuProps {
  sessionId: string;
  projectPath: string;
  variant?: "dropdown" | "context";
  trigger?: ReactElement;
  children?: ReactNode;
  onRenameStart: () => void;
  onAfterArchive?: () => void;
}

export function SessionActionsMenu({
  sessionId,
  projectPath,
  variant = "dropdown",
  trigger,
  children,
  onRenameStart,
  onAfterArchive,
}: SessionActionsMenuProps) {
  const togglePinSession = useProjectStore((s) => s.togglePinSession);
  const archiveSession = useProjectStore((s) => s.archiveSession);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const isPinned = (pinnedSessions[projectPath] ?? []).includes(sessionId);

  const sessions = useAgentStore((s) => s.sessions);
  const session = sessions.get(sessionId);
  const cwd = session?.cwd ?? projectPath;

  const handleCopySessionId = () => {
    log("copySessionId: %s", sessionId.slice(0, 8));
    navigator.clipboard.writeText(sessionId);
  };

  const handleCopyWorkingDirectory = () => {
    log("copyCwd: %s", cwd);
    navigator.clipboard.writeText(cwd);
  };

  const handleArchive = () => {
    archiveSession(projectPath, sessionId);
    onAfterArchive?.();
  };

  if (variant === "context") {
    return (
      <ContextMenu>
        <ContextMenuTrigger render={children as ReactElement}></ContextMenuTrigger>
        <ContextMenuPopup>
          <ContextMenuItem onClick={onRenameStart}>Rename</ContextMenuItem>
          <ContextMenuItem onClick={() => togglePinSession(projectPath, sessionId)}>
            {isPinned ? "Unpin" : "Pin"}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleArchive}>Archive</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleCopyWorkingDirectory}>
            Copy working directory
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopySessionId}>Copy session ID</ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </Button>
          )
        }
      />
      <MenuPopup side="bottom" align="end" className="text-xs">
        <MenuItem onClick={onRenameStart}>Rename</MenuItem>
        <MenuItem onClick={() => togglePinSession(projectPath, sessionId)}>
          {isPinned ? "Unpin" : "Pin"}
        </MenuItem>
        <MenuItem onClick={handleArchive}>Archive</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={handleCopyWorkingDirectory}>Copy working directory</MenuItem>
        <MenuItem onClick={handleCopySessionId}>Copy session ID</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
