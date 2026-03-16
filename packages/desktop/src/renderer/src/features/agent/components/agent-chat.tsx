import type { FileUIPart } from "ai";
import type { StickToBottomContext } from "use-stick-to-bottom";

import debug from "debug";
import { useEffect, useRef, useState } from "react";

import type { ImageAttachment } from "../../../../../shared/features/agent/types";

import { client } from "../../../orpc";
import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";
import { useAgentStore } from "../store";

const chatLog = debug("neovate:agent-chat");

function attachmentsToFileParts(attachments?: ImageAttachment[]): FileUIPart[] {
  if (!attachments || attachments.length === 0) return [];
  return attachments.map((a) => ({
    type: "file" as const,
    mediaType: a.mediaType,
    filename: a.filename,
    url: `data:${a.mediaType};base64,${a.base64}`,
  }));
}
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../../components/ai-elements/conversation";
import { cn } from "../../../lib/utils";
import { claudeCodeChatManager } from "../chat-manager";
import { useClaudeCodeChat } from "../hooks/use-claude-code-chat";
import { useNewSession } from "../hooks/use-new-session";
import { BranchSwitcher } from "./branch-switcher";
import { MessageInput } from "./message-input";
import { MessageParts } from "./message-parts";
import { PermissionDialog } from "./permission-dialog";
import { TaskProgress } from "./task-progress";
import { ClaudeCodeToolUIPart } from "./tool-parts";
import { WelcomePanel } from "./welcome-panel";

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
    const files = attachmentsToFileParts(attachments);
    claudeCodeChatManager.getChat(activeSessionId)?.sendMessage({
      text: message,
      files: files.length > 0 ? files : undefined,
      metadata: { sessionId: activeSessionId, parentToolUseId: null },
    });
  };

  // State 1: No session yet (or new empty session) — show welcome panel with input
  if (!activeSession || activeSession.isNew) {
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
        {cwd && (
          <div className="px-4 pb-2 max-w-3xl mx-auto w-full">
            <BranchSwitcher cwd={cwd} />
          </div>
        )}
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
  const { messages, status, error, pendingRequests, sendMessage, stop } =
    useClaudeCodeChat(sessionId);
  const hasPendingRequest = pendingRequests.length > 0;

  // Ref to access scroll context for smooth scrolling on new message
  const conversationContextRef = useRef<StickToBottomContext | null>(null);

  const handleSend = (text: string, attachments?: ImageAttachment[]) => {
    chatLog(
      "handleSend: sessionId=%s msgLen=%d attachments=%d",
      sessionId.slice(0, 8),
      text.length,
      attachments?.length ?? 0,
    );
    const files = attachmentsToFileParts(attachments);
    sendMessage({
      text,
      files: files.length > 0 ? files : undefined,
      metadata: { sessionId, parentToolUseId: null },
    });
    // Smooth scroll to bottom when user sends a new message
    conversationContextRef.current?.scrollToBottom("smooth");
  };

  const handleCancel = () => {
    chatLog("handleCancel: sessionId=%s", sessionId.slice(0, 8));
    stop();
  };

  return (
    <div className="flex h-full flex-col">
      <Conversation contextRef={conversationContextRef}>
        <ConversationContent>
          {messages.map((message) => (
            <MessageParts
              key={message.id}
              message={message}
              renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 max-w-3xl mx-auto w-full">
        <TaskProgress tasks={tasks} />
        {error && (
          <div className="mx-4 mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {error.message}
          </div>
        )}
        <div className={cn("relative min-w-0", hasPendingRequest && "grid")}>
          <div className={cn(hasPendingRequest && "col-start-1 row-start-1 self-end z-10 min-w-0")}>
            <PermissionDialog sessionId={sessionId} />
          </div>
          <div
            className={cn(
              "relative min-w-0",
              hasPendingRequest && "col-start-1 row-start-1 self-end pointer-events-none z-0",
            )}
          >
            <MessageInput
              onSend={handleSend}
              onCancel={handleCancel}
              streaming={status === "streaming"}
              disabled={hasPendingRequest}
              cwd={cwd}
              dockAttached={hasPendingRequest}
            />
          </div>
        </div>
        {cwd && (
          <div className="px-4 pb-2">
            <BranchSwitcher cwd={cwd} disabled={status === "streaming"} />
          </div>
        )}
      </div>
    </div>
  );
}
