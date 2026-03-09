import { useEffect, useRef, useState } from "react";
import debug from "debug";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { client } from "../../../orpc";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { useConfigStore } from "../../config/store";
import type { ImageAttachment } from "../../../../../shared/features/agent/types";

const chatLog = debug("neovate:agent-chat");
import { useNewSession } from "../hooks/use-new-session";
import { useClaudeCodeChat } from "../hooks/use-claude-code-chat";
import { claudeCodeChatManager } from "../chat-manager";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../../components/ai-elements/conversation";
import { MessageParts } from "./message-parts";
import { MessageInput } from "./message-input";
import { PermissionDialog } from "./permission-dialog";
import { WelcomePanel } from "./welcome-panel";
import { TaskProgress } from "./task-progress";

export function AgentChat() {
  const multiProjectSupport = useConfigStore((s) => s.multiProjectSupport);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectPath = activeProject?.path ?? "";
  const [cwd, setCwd] = useState("");

  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const setAgentSessions = useAgentStore((s) => s.setAgentSessions);
  const sessions = useAgentStore((s) => s.sessions);

  const { createNewSession } = useNewSession();

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  // Track the project path we last initialized for
  const initializedPathRef = useRef<string | null>(null);

  chatLog(
    "render: activeProject=%s activeSession=%s sessionCount=%d isNew=%s",
    activeProjectPath || "none",
    activeSessionId?.slice(0, 8) ?? "none",
    sessions.size,
    activeSession?.isNew ?? "-",
  );

  // On project switch: list sessions and create a new empty session
  useEffect(() => {
    chatLog(
      "effect[project-switch]: projectPath=%s multiProject=%s",
      activeProjectPath,
      multiProjectSupport,
    );
    if (activeProjectPath) setCwd(activeProjectPath);
    if (!multiProjectSupport) setActiveSession(null);

    if (!activeProjectPath && !multiProjectSupport) {
      chatLog("effect[project-switch]: no project, clearing sessions");
      setAgentSessions([]);
      return;
    }

    // In multi-project mode, fetch ALL sessions (no cwd filter)
    // In single-project mode, fetch only for the active project
    const listArgs = multiProjectSupport ? {} : { cwd: activeProjectPath };
    chatLog("effect[project-switch]: listing sessions args=%o", listArgs);
    client.agent
      .listSessions(listArgs)
      .then((sessions) => {
        chatLog("effect[project-switch]: listSessions returned total=%d", sessions.length);
        setAgentSessions(sessions);
      })
      .catch((error) => {
        chatLog(
          "effect[project-switch]: listSessions FAILED error=%s",
          error instanceof Error ? error.message : String(error),
        );
        setAgentSessions([]);
      });
  }, [activeProjectPath, multiProjectSupport, setActiveSession, setAgentSessions]);

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

  const handleSend = (message: string, attachments?: ImageAttachment[]) => {
    chatLog(
      "handleSend: sessionId=%s msgLen=%d attachments=%d",
      activeSessionId?.slice(0, 8) ?? "new",
      message.length,
      attachments?.length ?? 0,
    );
    if (!activeSessionId) return;
    useAgentStore.getState().addUserMessage(activeSessionId, message);
    claudeCodeChatManager.getChat(activeSessionId)?.sendMessage({
      text: message,
      metadata: { sessionId: activeSessionId, parentToolUseId: null },
    });
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
        <MessageInput
          onSend={handleSend}
          onCancel={() => {}}
          streaming={false}
          disabled={!activeProjectPath}
          cwd={cwd}
        />
      </div>
    );
  }

  // State 2: Active session — full chat
  return (
    <AgentChatSession
      key={activeSessionId}
      sessionId={activeSessionId!}
      cwd={cwd}
      tasks={activeSession?.tasks}
    />
  );
}

function AgentChatSession({
  sessionId,
  cwd,
  tasks,
}: {
  sessionId: string;
  cwd: string;
  tasks: Map<string, import("../store").TaskState>;
}) {
  const { messages, status, error, pendingRequests, sendMessage, respondToRequest, stop } =
    useClaudeCodeChat(sessionId);

  chatLog(
    "render: showing chat msgs=%d status=%s pendingReqs=%d",
    messages.length,
    status,
    pendingRequests.length,
  );

  const handleSend = (text: string) => {
    chatLog("handleSend: sessionId=%s msgLen=%d", sessionId.slice(0, 8), text.length);
    sendMessage({ text, metadata: { sessionId, parentToolUseId: null } });
  };

  const handleCancel = () => {
    chatLog("handleCancel: sessionId=%s", sessionId.slice(0, 8));
    stop();
  };

  const handleResolve = (requestId: string, result: PermissionResult) => {
    chatLog(
      "handleResolvePermission: sessionId=%s requestId=%s behavior=%s",
      sessionId.slice(0, 8),
      requestId,
      result.behavior,
    );
    respondToRequest(requestId, { type: "permission_request", result });
  };

  return (
    <div className="flex h-full flex-col">
      <Conversation>
        <ConversationContent>
          {messages.map((message) => (
            <MessageParts key={message.id} message={message} />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {pendingRequests.map((req) => (
        <PermissionDialog
          key={req.requestId}
          requestId={req.requestId}
          request={req.request}
          onResolve={handleResolve}
        />
      ))}
      <TaskProgress tasks={tasks} />
      {error && (
        <div className="mx-4 mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}
      <MessageInput
        onSend={handleSend}
        onCancel={handleCancel}
        streaming={status === "streaming"}
        cwd={cwd}
      />
    </div>
  );
}
