import type { ReactElement, ReactNode } from "react";

import debug from "debug";
import { MoreHorizontal } from "lucide-react";

import { Button } from "../../../components/ui/button";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../../../components/ui/menu";
import { useProjectStore } from "../../project/store";
import { useAgentStore } from "../store";

const log = debug("neovate:session-actions-menu");

interface SessionActionsMenuProps {
  sessionId: string;
  projectPath: string;
  variant?: "dropdown" | "context";
  trigger?: ReactElement;
  children?: ReactNode;
  onRenameStart: () => void;
}

export function SessionActionsMenu({
  sessionId,
  projectPath,
  variant = "dropdown",
  trigger,
  children,
  onRenameStart,
}: SessionActionsMenuProps) {
  const togglePinSession = useProjectStore((s) => s.togglePinSession);
  const archiveSession = useProjectStore((s) => s.archiveSession);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const isPinned = (pinnedSessions[projectPath] ?? []).includes(sessionId);

  const sessions = useAgentStore((s) => s.sessions);
  const session = sessions.get(sessionId);
  const cwd = session?.cwd ?? projectPath;
  const isNew = session?.isNew ?? false;

  const handleCopySessionId = () => {
    log("copySessionId: %s", sessionId.slice(0, 8));
    navigator.clipboard.writeText(sessionId);
  };

  const handleCopyJsonlPath = () => {
    const encoded = cwd.replaceAll(/[\/.]/g, "-");
    const jsonlPath = `${window.api.homedir}/.claude/projects/${encoded}/${sessionId}.jsonl`;
    log("copyJsonlPath: %s", jsonlPath);
    navigator.clipboard.writeText(jsonlPath);
  };

  const handleCopyWorkingDirectory = () => {
    log("copyCwd: %s", cwd);
    navigator.clipboard.writeText(cwd);
  };

  const handleArchive = () => {
    const isActive = useAgentStore.getState().activeSessionId === sessionId;
    archiveSession(projectPath, sessionId, isActive);
  };

  if (variant === "context") {
    return (
      <ContextMenu>
        <ContextMenuTrigger render={children as ReactElement}></ContextMenuTrigger>
        <ContextMenuPopup>
          <ContextMenuItem disabled={isNew} onClick={onRenameStart}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isNew}
            onClick={() => togglePinSession(projectPath, sessionId)}
          >
            {isPinned ? "Unpin" : "Pin"}
          </ContextMenuItem>
          <ContextMenuItem disabled={isNew} onClick={handleArchive}>
            Archive
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleCopyWorkingDirectory}>
            Copy working directory
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopySessionId}>Copy session ID</ContextMenuItem>
          <ContextMenuItem disabled={isNew} onClick={handleCopyJsonlPath}>
            Copy session JSONL path
          </ContextMenuItem>
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
        <MenuItem disabled={isNew} onClick={onRenameStart}>
          Rename
        </MenuItem>
        <MenuItem disabled={isNew} onClick={() => togglePinSession(projectPath, sessionId)}>
          {isPinned ? "Unpin" : "Pin"}
        </MenuItem>
        <MenuItem disabled={isNew} onClick={handleArchive}>
          Archive
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={handleCopyWorkingDirectory}>Copy working directory</MenuItem>
        <MenuItem onClick={handleCopySessionId}>Copy session ID</MenuItem>
        <MenuItem disabled={isNew} onClick={handleCopyJsonlPath}>
          Copy session JSONL path
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
