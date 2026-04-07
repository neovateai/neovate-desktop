import debug from "debug";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { client } from "../../../orpc";
import { useProjectStore } from "../../project/store";
import { useAgentStore } from "../store";
import { isImeComposingKeyEvent } from "../utils/keyboard";
import { SessionActionsMenu } from "./session-actions-menu";

const log = debug("neovate:session-info-bar");

export function SessionInfoBar() {
  const { t } = useTranslation();
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const sessions = useAgentStore((s) => s.sessions);
  const renameSession = useAgentStore((s) => s.renameSession);
  const activeProject = useProjectStore((s) => s.activeProject);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
  const projectPath = activeProject?.path ?? "";
  const projectName = activeProject?.name ?? projectPath.split("/").pop() ?? "";

  log("render: sessionId=%s project=%s", activeSessionId?.slice(0, 8) ?? "none", projectName);

  const handleStartRename = () => {
    if (activeSession) {
      log("startRename: sessionId=%s", activeSessionId?.slice(0, 8));
      setRenameValue(activeSession.title || t("session.newChat"));
      setIsRenaming(true);
    }
  };

  const handleSaveRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && activeSessionId) {
      try {
        log("saveRename: sessionId=%s title=%s", activeSessionId.slice(0, 8), trimmed);
        await renameSession(activeSessionId, trimmed);
      } catch (error) {
        console.error("Failed to rename session:", error);
      }
    }
    setIsRenaming(false);
  };

  const hasSession = activeSession && activeSessionId;

  return (
    <div className="flex items-center gap-2 text-sm">
      {hasSession && isRenaming ? (
        <input
          className="max-w-40 rounded border border-primary bg-transparent px-1 py-0.5 text-sm outline-none"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleSaveRename}
          onKeyDown={(e) => {
            if (isImeComposingKeyEvent(e.nativeEvent)) return;

            if (e.key === "Enter") handleSaveRename();
            if (e.key === "Escape") setIsRenaming(false);
          }}
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      ) : (
        <span className="max-w-80 truncate font-medium text-foreground">
          {activeSession?.title || t("session.newChat")}
        </span>
      )}
      {hasSession && projectName && (
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            if (projectPath) {
              client.utils.openIn({ cwd: projectPath, app: "finder" });
            }
          }}
          title={projectPath}
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          <span className="max-w-32 truncate">{projectName}</span>
        </button>
      )}
      {hasSession && (
        <SessionActionsMenu
          sessionId={activeSessionId}
          projectPath={projectPath}
          onRenameStart={handleStartRename}
        />
      )}
    </div>
  );
}
