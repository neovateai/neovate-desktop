import { useEffect, useRef, useState } from "react";
import debug from "debug";
import { client } from "../../../orpc";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";

const chatLog = debug("neovate:agent-chat");
import { usePrompt } from "../hooks/use-prompt";
import { usePermission } from "../hooks/use-permission";
import { useNewSession } from "../hooks/use-new-session";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { PermissionDialog } from "./permission-dialog";
import { WelcomePanel } from "./welcome-panel";
import { TaskProgress } from "./task-progress";

export function AgentChat() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectPath = activeProject?.path ?? "";
  const [cwd, setCwd] = useState("");

  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const setAgentSessions = useAgentStore((s) => s.setAgentSessions);
  const sessions = useAgentStore((s) => s.sessions);

  const { sendPrompt, cancel } = usePrompt();
  const { resolvePermission } = usePermission();
  const { createNewSession } = useNewSession();

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  // Track the project path we last initialized for
  const initializedPathRef = useRef<string | null>(null);

  chatLog(
    "render: activeProject=%s activeSession=%s sessionCount=%d isNew=%s streaming=%s hasPerm=%s",
    activeProjectPath || "none",
    activeSessionId?.slice(0, 8) ?? "none",
    sessions.size,
    activeSession?.isNew ?? "-",
    activeSession?.streaming ?? "-",
    activeSession?.pendingPermission ? "yes" : "no",
  );

  // On project switch: list sessions and create a new empty session
  useEffect(() => {
    chatLog("effect[project-switch]: projectPath=%s", activeProjectPath);
    if (activeProjectPath) setCwd(activeProjectPath);
    setActiveSession(null);

    if (!activeProjectPath) {
      chatLog("effect[project-switch]: no project, clearing sessions");
      setAgentSessions([]);
      return;
    }

    chatLog("effect[project-switch]: listing sessions for cwd=%s", activeProjectPath);
    client.agent
      .listSessions({ cwd: activeProjectPath })
      .then((sessions) => {
        chatLog(
          "effect[project-switch]: listSessions returned total=%d sessions=%o",
          sessions.length,
          // sessions.map((s) => (JSON.stringify({ id: s.sessionId.slice(0, 8), cwd: s.cwd, title: s.title }))),
        );
        setAgentSessions(sessions);
      })
      .catch((error) => {
        chatLog(
          "effect[project-switch]: listSessions FAILED error=%s",
          error instanceof Error ? error.message : String(error),
        );
        setAgentSessions([]);
      });
  }, [activeProjectPath, setActiveSession, setAgentSessions]);

  // Auto-create a new session when project is active and no session exists
  useEffect(() => {
    if (!activeProjectPath) return;
    if (initializedPathRef.current === activeProjectPath) {
      chatLog("effect[auto-create]: skipping, already initialized for %s", activeProjectPath);
      return;
    }

    initializedPathRef.current = activeProjectPath;
    chatLog("effect[auto-create]: creating new session for %s", activeProjectPath);
    createNewSession(activeProjectPath)
      .then((sessionId) => {
        chatLog("effect[auto-create]: session created sessionId=%s", sessionId);
      })
      .catch((error) => {
        chatLog(
          "effect[auto-create]: FAILED error=%s",
          error instanceof Error ? error.message : String(error),
        );
      });
  }, [activeProjectPath, createNewSession]);

  const handleSend = (message: string) => {
    chatLog(
      "handleSend: sessionId=%s msgLen=%d",
      activeSession?.sessionId?.slice(0, 8) ?? "new",
      message.length,
    );
    sendPrompt(activeSession?.sessionId, message);
  };

  const handleCancel = () => {
    if (!activeSession) return;
    chatLog("handleCancel: sessionId=%s", activeSession.sessionId.slice(0, 8));
    cancel(activeSession.sessionId);
  };

  const handleResolvePermission = (requestId: string, allow: boolean) => {
    if (!activeSession) return;
    chatLog(
      "handleResolvePermission: sessionId=%s requestId=%s allow=%s",
      activeSession.sessionId.slice(0, 8),
      requestId,
      allow,
    );
    resolvePermission(activeSession.sessionId, requestId, allow);
  };

  // State 1: No session yet (or new empty session) — show welcome panel with input
  if (!activeSession || activeSession.isNew) {
    chatLog(
      "render: showing welcome panel (activeSession=%s isNew=%s)",
      activeSession ? "yes" : "no",
      activeSession?.isNew ?? "-",
    );
    return (
      <div className="flex h-full flex-col">
        <WelcomePanel />
        <MessageInput onSend={handleSend} onCancel={() => {}} streaming={false} cwd={cwd} />
      </div>
    );
  }

  // State 2: Active session — full chat
  chatLog(
    "render: showing chat msgs=%d streaming=%s error=%s perm=%s",
    activeSession.messages.length,
    activeSession.streaming,
    activeSession.promptError ?? "none",
    activeSession.pendingPermission?.toolName ?? "none",
  );
  return (
    <div className="flex h-full flex-col">
      <MessageList messages={activeSession.messages} streaming={activeSession.streaming} />
      {activeSession.pendingPermission && (
        <PermissionDialog
          permission={activeSession.pendingPermission}
          onResolve={handleResolvePermission}
        />
      )}
      <TaskProgress tasks={activeSession.tasks} />
      {activeSession.usage && (
        <div className="flex items-center gap-3 border-t border-border px-4 py-1 text-[10px] text-muted-foreground/60">
          <span>${activeSession.usage.totalCostUsd.toFixed(4)}</span>
          <span>{activeSession.usage.totalInputTokens.toLocaleString()} in</span>
          <span>{activeSession.usage.totalOutputTokens.toLocaleString()} out</span>
        </div>
      )}
      {activeSession.promptError && (
        <div className="mx-4 mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {activeSession.promptError}
        </div>
      )}
      <MessageInput
        onSend={handleSend}
        onCancel={handleCancel}
        streaming={activeSession.streaming}
        cwd={cwd}
      />
    </div>
  );
}
