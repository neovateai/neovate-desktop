import type { ReactElement, ReactNode } from "react";

import debug from "debug";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { encodeProjectPath } from "../../../../../shared/claude-code/paths";
import { DEEPLINK_SCHEME } from "../../../../../shared/constants";
import { Button } from "../../../components/ui/button";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../../../components/ui/menu";
import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";
import { claudeCodeChatManager } from "../chat-manager";
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

  const permissionMode = useConfigStore((s) => s.permissionMode);

  const handleCopyResumeCommand = () => {
    const modeFlag = permissionMode !== "default" ? ` --permission-mode ${permissionMode}` : "";
    const command = `cd ${cwd} && claude --resume ${sessionId}${modeFlag}`;
    log("copyResumeCommand: %s", command);
    navigator.clipboard.writeText(command);
  };

  const handleCopyDeeplink = () => {
    const deeplink = `${DEEPLINK_SCHEME}://session/${sessionId}?project=${encodeURIComponent(cwd)}`;
    log("copyDeeplink: %s", deeplink);
    navigator.clipboard.writeText(deeplink);
  };

  const handleArchive = () => {
    const isActive = useAgentStore.getState().activeSessionId === sessionId;
    archiveSession(projectPath, sessionId, isActive);
  };

  const sessionTitle = useAgentStore((s) => {
    const session = s.sessions.get(sessionId);
    if (session?.title) return session.title;
    return s.agentSessions.find((a) => a.sessionId === sessionId)?.title;
  });

  const handleFork = async () => {
    log("forkSession: %s", sessionId.slice(0, 8));
    try {
      const { forkedSessionId } = await claudeCodeChatManager.forkSession(
        sessionId,
        cwd,
        sessionTitle,
      );
      const forkTitle = sessionTitle ? `${sessionTitle} (Fork)` : "(Fork)";
      const store = useAgentStore.getState();

      // Register with isNew: false so sidebar filters don't hide it
      store.createSession(forkedSessionId, {
        cwd,
        title: forkTitle,
        createdAt: new Date().toISOString(),
        isNew: false,
      });

      // Apply capabilities from the loaded chat
      const chat = claudeCodeChatManager.getChat(forkedSessionId);
      const caps = chat?.store.getState().capabilities;
      if (caps) {
        const s = useAgentStore.getState();
        if (caps.commands?.length) s.setAvailableCommands(forkedSessionId, caps.commands);
        if (caps.models?.length) s.setAvailableModels(forkedSessionId, caps.models);
      }

      // Inherit pin state
      if (isPinned) {
        togglePinSession(projectPath, forkedSessionId);
      }
    } catch (error) {
      log("forkSession: FAILED error=%s", error instanceof Error ? error.message : error);
    }
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
          <ContextMenuItem disabled={isNew} onClick={handleFork}>
            {t("session.fork")}
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
          <ContextMenuItem disabled={isNew} onClick={handleCopyResumeCommand}>
            {t("session.copyResumeCommand")}
          </ContextMenuItem>
          <ContextMenuItem disabled={isNew} onClick={handleCopyDeeplink}>
            {t("session.copyDeeplink")}
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
        <MenuItem disabled={isNew} onClick={handleFork}>
          {t("session.fork")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={handleCopyWorkingDirectory}>
          {t("session.copyWorkingDirectory")}
        </MenuItem>
        <MenuItem onClick={handleCopySessionId}>{t("session.copySessionId")}</MenuItem>
        <MenuItem disabled={isNew} onClick={handleCopyJsonlPath}>
          {t("session.copyJsonlPath")}
        </MenuItem>
        <MenuItem disabled={isNew} onClick={handleCopyResumeCommand}>
          {t("session.copyResumeCommand")}
        </MenuItem>
        <MenuItem disabled={isNew} onClick={handleCopyDeeplink}>
          {t("session.copyDeeplink")}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
