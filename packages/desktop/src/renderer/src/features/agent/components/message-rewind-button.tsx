import debug from "debug";
import { RotateCcwIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RewindFilesResult } from "../../../../../shared/features/agent/types";

import { Popover, PopoverPopup, PopoverTrigger } from "../../../components/ui/popover";
import { toastManager } from "../../../components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { cn } from "../../../lib/utils";
import { claudeCodeChatManager } from "../chat-manager";
import { useAgentStore } from "../store";

const log = debug("neovate:rewind-button");

// Cache dry-run results per (sessionId, messageId). Invalidated on turn completion.
const dryRunCache = new Map<string, RewindFilesResult>();

export function invalidateDryRunCache(sessionId: string) {
  for (const key of dryRunCache.keys()) {
    if (key.startsWith(sessionId + ":")) {
      dryRunCache.delete(key);
    }
  }
}

type Props = {
  sessionId: string;
  messageId: string;
  disabled: boolean;
};

export function MessageRewindButton({ sessionId, messageId, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dryRun, setDryRun] = useState<RewindFilesResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const isRewinding = useAgentStore((s) => s.isRewinding);

  const fetchDryRun = useCallback(async () => {
    const cacheKey = `${sessionId}:${messageId}`;
    const cached = dryRunCache.get(cacheKey);
    if (cached) {
      setDryRun(cached);
      return;
    }
    setDryRunLoading(true);
    try {
      const { client } = await import("../../../orpc");
      const result = await client.agent.rewindFilesDryRun({ sessionId, messageId });
      dryRunCache.set(cacheKey, result);
      setDryRun(result);
    } catch (error) {
      log("dryRun failed: %s", error instanceof Error ? error.message : error);
      setDryRun({ canRewind: false });
    } finally {
      setDryRunLoading(false);
    }
  }, [sessionId, messageId]);

  // Fetch dry-run on popover open
  useEffect(() => {
    if (open) {
      fetchDryRun();
    } else {
      setDryRun(null);
      setDryRunLoading(false);
    }
  }, [open, fetchDryRun]);

  // Auto-close popover when streaming starts
  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const handleRewind = useCallback(
    async (restoreFiles: boolean) => {
      setOpen(false);
      const store = useAgentStore.getState();

      log(
        "handleRewind: sessionId=%s messageId=%s restoreFiles=%s",
        sessionId.slice(0, 8),
        messageId.slice(0, 8),
        restoreFiles,
      );

      store.setIsRewinding(true);

      try {
        // Extract text from the target message before the session switches
        const chat = claudeCodeChatManager.getChat(sessionId);
        const messages = chat?.store.getState().messages ?? [];
        const targetMessage = messages.find((m) => m.id === messageId);
        const textPart = targetMessage?.parts.find((p) => p.type === "text");
        const prefillText = textPart && "text" in textPart ? textPart.text : "";

        // Interrupt if agent is active
        const status = chat?.store.getState().status;
        if (status === "streaming" || status === "submitted") {
          await chat?.interrupt();
        }

        // Finalize any existing undo buffer — delete old session file
        if (store.rewindUndoBuffer) {
          await claudeCodeChatManager.disposeChat(store.rewindUndoBuffer.originalSessionId);
          const { client } = await import("../../../orpc");
          client.agent
            .deleteSessionFile({ sessionId: store.rewindUndoBuffer.originalSessionId })
            .catch(() => {});
          store.setRewindUndoBuffer(null);
        }

        // Execute the rewind, passing the original title to avoid "(fork)" suffix
        const original = store.sessions.get(sessionId);
        const result = await claudeCodeChatManager.rewindToMessage(
          sessionId,
          messageId,
          restoreFiles,
          original?.title,
        );
        const forkedChat = claudeCodeChatManager.getChat(result.forkedSessionId);
        const forkedMessages = forkedChat?.store.getState().messages ?? [];

        store.applyRewind(sessionId, result.forkedSessionId, {
          sessionId: result.forkedSessionId,
          cwd: original?.cwd,
          title: original?.title,
          createdAt: original?.createdAt ?? new Date().toISOString(),
          isNew: false,
          messages: forkedMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content:
                m.parts
                  .filter((p): p is { type: "text"; text: string } => p.type === "text")
                  .map((p) => p.text)
                  .join("") || "",
              toolCalls: [],
            })),
          availableCommands: original?.availableCommands ?? [],
          availableModels: original?.availableModels ?? [],
          currentModel: original?.currentModel,
          modelScope: original?.modelScope,
          providerId: original?.providerId,
          permissionMode: original?.permissionMode,
          tasks: new Map(),
        });

        // Pre-fill input with the rewound message's text
        if (prefillText) {
          window.dispatchEvent(
            new CustomEvent("neovate:insert-chat", {
              detail: { text: prefillText },
            }),
          );
        }

        // Show undo toast for conversation-only rewinds
        if (!restoreFiles) {
          store.setRewindUndoBuffer({
            originalSessionId: sessionId,
            forkedSessionId: result.forkedSessionId,
          });

          toastManager.add({
            type: "info",
            title: t("chat.rewind.undoToast"),
            timeout: 10_000,
            actionProps: {
              children: t("chat.rewind.undo"),
              onClick: () => handleUndo(sessionId, result.forkedSessionId),
            },
            onClose: async () => {
              // Timeout expired or dismissed — finalize by disposing original chat and deleting file
              const buf = useAgentStore.getState().rewindUndoBuffer;
              if (buf && buf.originalSessionId === sessionId) {
                claudeCodeChatManager.disposeChat(sessionId);
                const { client } = await import("../../../orpc");
                client.agent.deleteSessionFile({ sessionId }).catch(() => {});
                useAgentStore.getState().setRewindUndoBuffer(null);
              }
            },
          });
        } else {
          // File restore — no undo, delete old session immediately
          import("../../../orpc").then(({ client }) => {
            client.agent.deleteSessionFile({ sessionId }).catch(() => {});
          });
        }
      } catch (error) {
        log("rewind failed: %s", error instanceof Error ? error.message : error);
        store.setIsRewinding(false);
        toastManager.add({
          type: "error",
          title: t("chat.rewind.error"),
          timeout: 5000,
        });
      }
    },
    [sessionId, messageId, t],
  );

  const handleUndo = useCallback(
    async (originalSessionId: string, forkedSessionId: string) => {
      log("handleUndo: restoring original=%s", originalSessionId.slice(0, 8));
      const store = useAgentStore.getState();
      const cwd = store.sessions.get(forkedSessionId)?.cwd ?? "";

      try {
        // Load original session back
        await claudeCodeChatManager.loadSession(originalSessionId, cwd);
        const chat = claudeCodeChatManager.getChat(originalSessionId);
        const messages = chat?.store.getState().messages ?? [];

        store.undoRewindStore(originalSessionId, {
          sessionId: originalSessionId,
          cwd,
          title: store.sessions.get(forkedSessionId)?.title,
          createdAt: store.sessions.get(forkedSessionId)?.createdAt ?? new Date().toISOString(),
          isNew: false,
          messages: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content:
                m.parts
                  .filter((p): p is { type: "text"; text: string } => p.type === "text")
                  .map((p) => p.text)
                  .join("") || "",
              toolCalls: [],
            })),
          availableCommands: [],
          availableModels: [],
          tasks: new Map(),
        });

        // Dispose the fork
        await claudeCodeChatManager.disposeChat(forkedSessionId);
      } catch (error) {
        log("undo failed: %s", error instanceof Error ? error.message : error);
        toastManager.add({
          type: "error",
          title: t("chat.rewind.undoError"),
          timeout: 5000,
        });
      }
    },
    [t],
  );

  const showFileRestore =
    dryRun && dryRun.canRewind && dryRun.filesChanged && dryRun.filesChanged.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                className={cn(
                  "inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent h-6 w-6",
                  (disabled || isRewinding) && "pointer-events-none opacity-50",
                )}
                render={<button type="button" />}
              />
            }
          >
            <RotateCcwIcon size={12} />
            <span className="sr-only">{t("chat.rewind.tooltip")}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("chat.rewind.tooltip")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverPopup side="bottom" align="end" sideOffset={4} className="w-64 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent text-left"
          onClick={() => handleRewind(false)}
        >
          <RotateCcwIcon size={14} className="shrink-0 text-muted-foreground" />
          <span>{t("chat.rewind.conversationOnly")}</span>
        </button>

        {dryRunLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <LoaderCircleIcon size={14} className="animate-spin shrink-0" />
            <span>{t("chat.rewind.loading")}</span>
          </div>
        )}

        {showFileRestore && (
          <button
            type="button"
            className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent text-left"
            onClick={() => handleRewind(true)}
          >
            <RotateCcwIcon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <div>{t("chat.rewind.codeAndConversation")}</div>
              <div className="text-xs text-muted-foreground">
                {t("chat.rewind.filesSummary", {
                  count: dryRun!.filesChanged!.length,
                  insertions: dryRun!.insertions ?? 0,
                  deletions: dryRun!.deletions ?? 0,
                })}
              </div>
            </div>
          </button>
        )}
      </PopoverPopup>
    </Popover>
  );
}
