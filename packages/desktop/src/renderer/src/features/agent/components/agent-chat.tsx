import { useEffect, useRef, useState } from "react";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { client } from "../../../orpc";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { useNewSession } from "../hooks/use-new-session";
import { useClaudeCodeChat } from "../hooks/use-claude-code-chat";
import { claudeCodeChatManager } from "../chat-manager";
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
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  const { createNewSession } = useNewSession();
  const initializedPathRef = useRef<string | null>(null);

  // On project switch: list sessions
  useEffect(() => {
    if (activeProjectPath) setCwd(activeProjectPath);
    setActiveSession(null);
    if (!activeProjectPath) {
      setAgentSessions([]);
      return;
    }

    client.agent
      .listSessions({ cwd: activeProjectPath })
      .then((s) => setAgentSessions(s))
      .catch(() => setAgentSessions([]));
  }, [activeProjectPath, setActiveSession, setAgentSessions]);

  // Auto-create new session on project open
  useEffect(() => {
    if (!activeProjectPath) return;
    if (initializedPathRef.current === activeProjectPath) return;
    initializedPathRef.current = activeProjectPath;
    createNewSession(activeProjectPath).catch(() => {});
  }, [activeProjectPath, createNewSession]);

  const isNew = !activeSession || activeSession.isNew;

  if (isNew) {
    return (
      <div className="flex h-full flex-col">
        <WelcomePanel />
        <MessageInput
          onSend={(text) => {
            if (!activeSessionId) return;
            useAgentStore.getState().addUserMessage(activeSessionId, text);
            claudeCodeChatManager.getChat(activeSessionId)?.sendMessage({
              text,
              metadata: { sessionId: activeSessionId, parentToolUseId: null },
            });
          }}
          onCancel={() => {}}
          streaming={false}
          cwd={cwd}
        />
      </div>
    );
  }

  return <AgentChatSession sessionId={activeSessionId!} cwd={cwd} tasks={activeSession?.tasks} />;
}

function AgentChatSession({
  sessionId,
  cwd,
  tasks,
}: {
  sessionId: string;
  cwd: string;
  tasks: ReturnType<typeof useAgentStore.getState>["sessions"] extends Map<string, infer S>
    ? S["tasks"]
    : never;
}) {
  const { messages, status, error, pendingRequests, sendMessage, respondToRequest, stop } =
    useClaudeCodeChat(sessionId);

  console.log("[AgentChatSession] messages=%o", messages);

  const handleSend = (text: string) => {
    sendMessage({ text, metadata: { sessionId, parentToolUseId: null } });
  };

  const handleResolve = (requestId: string, result: PermissionResult) => {
    respondToRequest(requestId, { type: "permission_request", result });
  };

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} streaming={status === "streaming"} />
      {pendingRequests.map((req) => (
        <PermissionDialog
          key={req.requestId}
          requestId={req.requestId}
          request={req.request}
          onResolve={handleResolve}
        />
      ))}
      {tasks && <TaskProgress tasks={tasks} />}
      {error && (
        <div className="mx-4 mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}
      <MessageInput
        onSend={handleSend}
        onCancel={stop}
        streaming={status === "streaming"}
        cwd={cwd}
      />
    </div>
  );
}
