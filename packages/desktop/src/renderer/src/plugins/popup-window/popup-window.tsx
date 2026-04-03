import type { FileUIPart } from "ai";
import type { StickToBottomContext } from "use-stick-to-bottom";

import debug from "debug";
import { ExternalLink, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ImageAttachment } from "../../../../shared/features/agent/types";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { Button } from "../../components/ui/button";
import { claudeCodeChatManager } from "../../features/agent/chat-manager";
import { MessageInput } from "../../features/agent/components/message-input";
import { MessageParts } from "../../features/agent/components/message-parts";
import { PermissionDialog } from "../../features/agent/components/permission-dialog";
import { TaskProgress } from "../../features/agent/components/task-progress";
import { ClaudeCodeToolUIPart } from "../../features/agent/components/tool-parts";
import { useClaudeCodeChat } from "../../features/agent/hooks/use-claude-code-chat";
import { registerSessionInStore } from "../../features/agent/session-utils";
import { useAgentStore } from "../../features/agent/store";
import { useConfigStore } from "../../features/config/store";
import { useProjectStore } from "../../features/project/store";
import { postCrossWindowMessage } from "../../lib/cross-window-channel";
import { cn } from "../../lib/utils";
import { usePopupWindowTranslation } from "./i18n";

const log = debug("neovate:popup-window");

function attachmentsToFileParts(attachments?: ImageAttachment[]): FileUIPart[] {
  if (!attachments || attachments.length === 0) return [];
  return attachments.map((a) => ({
    type: "file" as const,
    mediaType: a.mediaType,
    filename: a.filename,
    url: `data:${a.mediaType};base64,${a.base64}`,
  }));
}

export default function PopupWindow() {
  const { t } = usePopupWindowTranslation();
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const loaded = useConfigStore((s) => s.loaded);
  const popupWindowStayOpen = useConfigStore((s) => s.popupWindowStayOpen);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const hasActiveChat = useAgentStore((s) => {
    if (!s.activeSessionId) return false;
    const session = s.sessions.get(s.activeSessionId);
    return session != null && !session.isNew;
  });

  const [sessionCreating, setSessionCreating] = useState(false);
  const initializedRef = useRef(false);

  // Auto-create a session when popup opens for the first time
  useEffect(() => {
    if (initializedRef.current || !activeProject?.path) return;
    initializedRef.current = true;

    log("auto-creating session for %s", activeProject.path);
    setSessionCreating(true);
    claudeCodeChatManager
      .createSession(activeProject.path)
      .then(({ sessionId, commands, models, currentModel, modelScope, providerId }) => {
        registerSessionInStore(
          sessionId,
          activeProject.path,
          { commands, models, currentModel, modelScope, providerId },
          true,
        );
        log("session created: %s", sessionId);
      })
      .catch((err) => {
        log("session creation failed: %O", err);
      })
      .finally(() => setSessionCreating(false));
  }, [activeProject?.path]);

  // Auto-focus input on mount and when window is re-shown
  useEffect(() => {
    const focusInput = () => {
      window.dispatchEvent(new CustomEvent("neovate:focus-input"));
    };

    // Focus on mount
    requestAnimationFrame(focusInput);

    // Focus when window is re-shown (hidden -> visible)
    const cleanup = window.api?.onPopupWindowShown?.(focusInput);
    return () => cleanup?.();
  }, []);

  // Esc to dismiss — handled at window level
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let the editor handle Esc first (clear suggestion, blur)
        // Only hide window if nothing else consumed the event
        requestAnimationFrame(() => {
          // Check if the editor is still focused — if not, Esc was consumed
          const activeEl = document.activeElement;
          const isEditorFocused = activeEl?.closest(".tiptap");
          if (!isEditorFocused) {
            window.close();
          }
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Loading skeleton
  if (!loaded) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <Titlebar />
        <div className="flex-1 flex flex-col justify-end p-4 gap-3">
          <div className="h-20 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-8 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      </div>
    );
  }

  // No-project empty state
  if (projects.length === 0 || !activeProject) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <Titlebar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">{t("popupWindow.noProjects")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              postCrossWindowMessage({
                type: "navigate-to-session",
                sessionId: "",
                projectPath: "",
              });
            }}
          >
            {t("popupWindow.openSettings")}
          </Button>
        </div>
      </div>
    );
  }

  const handleNewChat = useCallback(() => {
    if (!activeProject?.path) return;
    log("new chat for %s", activeProject.path);
    setSessionCreating(true);
    claudeCodeChatManager
      .createSession(activeProject.path)
      .then(({ sessionId, commands, models, currentModel, modelScope, providerId }) => {
        registerSessionInStore(
          sessionId,
          activeProject.path,
          { commands, models, currentModel, modelScope, providerId },
          true,
        );
        log("new chat session created: %s", sessionId);
      })
      .catch((err) => {
        log("new chat session creation failed: %O", err);
      })
      .finally(() => setSessionCreating(false));
  }, [activeProject?.path]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Titlebar sessionId={activeSessionId} onNewChat={handleNewChat} />
      {hasActiveChat && activeSessionId ? (
        <PopupChatSession sessionId={activeSessionId} cwd={activeProject.path} />
      ) : (
        <PopupInputMode
          cwd={activeProject.path}
          sessionCreating={sessionCreating}
          stayOpen={popupWindowStayOpen}
        />
      )}
    </div>
  );
}

function Titlebar({ sessionId, onNewChat }: { sessionId?: string | null; onNewChat?: () => void }) {
  const { t } = usePopupWindowTranslation();
  const activeProject = useProjectStore((s) => s.activeProject);

  const handleOpenInMain = useCallback(() => {
    if (!sessionId || !activeProject?.path) return;
    const session = useAgentStore.getState().sessions.get(sessionId);
    postCrossWindowMessage({
      type: "navigate-to-session",
      sessionId,
      projectPath: activeProject.path,
      title: session?.title,
    });
    window.close();
  }, [sessionId, activeProject?.path]);

  return (
    <div
      className="flex items-center h-10 px-3 shrink-0 border-b border-border/40"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* macOS traffic light spacing */}
      <div className="w-16 shrink-0" />
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground/60 select-none">{t("popupWindow.title")}</span>
      <div className="flex-1" />
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6"
          onClick={onNewChat}
          title={t("popupWindow.newChat")}
        >
          <SquarePen className="h-3.5 w-3.5" />
        </Button>
        {sessionId && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="h-6 w-6"
            onClick={handleOpenInMain}
            title={t("popupWindow.openInMain")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PopupInputMode({
  cwd,
  sessionCreating,
  stayOpen,
}: {
  cwd: string;
  sessionCreating: boolean;
  stayOpen: boolean;
}) {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);

  const handleSend = useCallback(
    (message: string, attachments?: ImageAttachment[]) => {
      if (!activeSessionId) return;
      log("sending message: sessionId=%s", activeSessionId.slice(0, 8));

      useAgentStore.getState().addUserMessage(activeSessionId, message);
      const files = attachmentsToFileParts(attachments);
      claudeCodeChatManager.getChat(activeSessionId)?.sendMessage({
        text: message,
        files: files.length > 0 ? files : undefined,
        metadata: { sessionId: activeSessionId, parentToolUseId: null },
      });

      // Notify main window
      postCrossWindowMessage({
        type: "session-created",
        sessionId: activeSessionId,
        projectPath: cwd,
        createdAt: new Date().toISOString(),
        title: message.slice(0, 50),
      });

      if (!stayOpen) {
        window.close();
      }
    },
    [activeSessionId, cwd, stayOpen],
  );

  return (
    <div className="flex-1 flex flex-col justify-end">
      <div className="max-w-3xl mx-auto w-full">
        <MessageInput
          onSend={handleSend}
          onCancel={() => {}}
          streaming={false}
          disabled={!activeSessionId || sessionCreating}
          sessionInitializing={sessionCreating}
          cwd={cwd}
          showProjectSelector
        />
      </div>
    </div>
  );
}

function PopupChatSession({ sessionId, cwd }: { sessionId: string; cwd: string }) {
  const tasks = useAgentStore((s) => s.sessions.get(sessionId)?.tasks);
  const { messages, status, error, pendingRequests, sendMessage, stop } =
    useClaudeCodeChat(sessionId);
  const hasPendingRequest = pendingRequests.length > 0;
  const conversationContextRef = useRef<StickToBottomContext | null>(null);

  const handleSend = useCallback(
    (text: string, attachments?: ImageAttachment[]) => {
      log("follow-up: sessionId=%s", sessionId.slice(0, 8));
      const files = attachmentsToFileParts(attachments);
      sendMessage({
        text,
        files: files.length > 0 ? files : undefined,
        metadata: { sessionId, parentToolUseId: null },
      });
      conversationContextRef.current?.scrollToBottom("smooth");
    },
    [sessionId, sendMessage],
  );

  const handleCancel = useCallback(() => {
    log("cancel: sessionId=%s", sessionId.slice(0, 8));
    stop();
  }, [sessionId, stop]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <Conversation contextRef={conversationContextRef}>
        <ConversationContent>
          {messages.map((message, i) => (
            <MessageParts
              key={message.id}
              message={message}
              isComplete={
                (status !== "streaming" && status !== "submitted") || i !== messages.length - 1
              }
              renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
              sessionId={sessionId}
              isStreaming={status === "streaming" || status === "submitted"}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 max-w-3xl mx-auto w-full">
        <TaskProgress tasks={tasks} />
        {error && (
          <div className="mx-4 mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
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
              showProjectSelector
            />
          </div>
        </div>
      </div>
    </div>
  );
}
