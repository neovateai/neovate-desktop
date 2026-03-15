import type { ReactElement, ReactNode } from "react";

import debug from "debug";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { encodeProjectPath } from "../../../../../shared/claude-code/paths";
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
  const { t } = useTranslation();
  const togglePinSession = useProjectStore((s) => s.togglePinSession);
  const archiveSession = useProjectStore((s) => s.archiveSession);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const isPinned = (pinnedSessions[projectPath] ?? []).includes(sessionId);

  const sessionCwd = useAgentStore((s) => s.sessions.get(sessionId)?.cwd);
  const sessionIsNew = useAgentStore((s) => s.sessions.get(sessionId)?.isNew);
  const cwd = sessionCwd ?? projectPath;
  const isNew = sessionIsNew ?? false;

  const handleCopySessionId = () => {
    log("copySessionId: %s", sessionId.slice(0, 8));
    navigator.clipboard.writeText(sessionId);
  };

  const handleCopyJsonlPath = () => {
    const encoded = encodeProjectPath(cwd);
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
            {t("session.rename")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isNew}
            onClick={() => togglePinSession(projectPath, sessionId)}
          >
            {isPinned ? t("session.unpin") : t("session.pin")}
          </ContextMenuItem>
          <ContextMenuItem disabled={isNew} onClick={handleArchive}>
            {t("session.archive")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleCopyWorkingDirectory}>
            {t("session.copyWorkingDirectory")}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopySessionId}>
            {t("session.copySessionId")}
          </ContextMenuItem>
          <ContextMenuItem disabled={isNew} onClick={handleCopyJsonlPath}>
            {t("session.copyJsonlPath")}
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
          {t("session.rename")}
        </MenuItem>
        <MenuItem disabled={isNew} onClick={() => togglePinSession(projectPath, sessionId)}>
          {isPinned ? t("session.unpin") : t("session.pin")}
        </MenuItem>
        <MenuItem disabled={isNew} onClick={handleArchive}>
          {t("session.archive")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={handleCopyWorkingDirectory}>
          {t("session.copyWorkingDirectory")}
        </MenuItem>
        <MenuItem onClick={handleCopySessionId}>{t("session.copySessionId")}</MenuItem>
        <MenuItem disabled={isNew} onClick={handleCopyJsonlPath}>
          {t("session.copyJsonlPath")}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
