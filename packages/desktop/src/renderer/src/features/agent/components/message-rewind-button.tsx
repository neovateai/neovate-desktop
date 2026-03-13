import { RotateCcwIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { ClaudeCodeUIMessage } from "../../../../../shared/claude-code/types";
import type { RewindFilesResult } from "../../../../../shared/features/agent/types";

import { Button } from "../../../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../../../components/ui/popover";
import { toastManager } from "../../../components/ui/toast";
import { client } from "../../../orpc";
import { claudeCodeChatManager } from "../chat-manager";
import { useAgentStore } from "../store";

interface MessageRewindButtonProps {
  sessionId: string;
  messageId: string;
  disabled?: boolean;
}

/** Saved chat-state messages for undo, kept outside React to survive re-renders. */
let savedChatMessages: ClaudeCodeUIMessage[] | null = null;

export function MessageRewindButton({ sessionId, messageId, disabled }: MessageRewindButtonProps) {
  const [open, setOpen] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<RewindFilesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const prevToastIdRef = useRef<string | null>(null);

  const handleOpen = useCallback(
    async (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setDryRunResult(null);
        return;
      }
      setLoading(true);
      try {
        const result = await client.agent.rewindFilesDryRun({ sessionId, messageId });
        setDryRunResult(result);
      } catch {
        setDryRunResult({ canRewind: false, error: "Failed to check file changes" });
      } finally {
        setLoading(false);
      }
    },
    [sessionId, messageId],
  );

  const executeRewind = useCallback(
    async (restoreFiles: boolean) => {
      setExecuting(true);
      try {
        const chat = claudeCodeChatManager.getChat(sessionId);

        // Interrupt any in-progress agent turn
        const status = chat?.store.getState().status;
        if (status === "streaming" || status === "submitted") {
          await chat?.interrupt();
        }

        // Dismiss previous undo toast if double-rewinding
        if (prevToastIdRef.current) {
          toastManager.close(prevToastIdRef.current);
          prevToastIdRef.current = null;
          useAgentStore.getState().clearRewindBuffer();
          savedChatMessages = null;
        }

        // Rewind files if requested
        if (restoreFiles) {
          await client.agent.rewindFiles({ sessionId, messageId });
        }

        // Save per-session chat messages for undo before slicing
        if (chat) {
          const chatMessages = chat.store.getState().messages;
          const chatIndex = chatMessages.findIndex((m) => m.id === messageId);
          if (chatIndex !== -1) {
            savedChatMessages = chatMessages.slice(chatIndex);
            chat.store.setState({ messages: chatMessages.slice(0, chatIndex) });
          }
        }

        // Rewind conversation in agent store
        const rewoundContent = useAgentStore.getState().rewindToMessage(sessionId, messageId);

        // Pre-fill input with rewound message text
        if (rewoundContent) {
          window.dispatchEvent(
            new CustomEvent("neovate:rewind-prefill", { detail: { text: rewoundContent } }),
          );
        }

        // Show undo toast
        const toastId = toastManager.add({
          type: "info",
          title: "Conversation rewound",
          actionProps: {
            children: "Undo",
            onClick: () => {
              // Restore agent store messages
              useAgentStore.getState().undoRewind();
              // Restore per-session chat state messages
              if (savedChatMessages && chat) {
                chat.store.setState((s) => ({
                  messages: [...s.messages, ...savedChatMessages!],
                }));
                savedChatMessages = null;
              }
              prevToastIdRef.current = null;
              toastManager.close(toastId);
            },
          },
          timeout: 10_000,
          onClose: () => {
            useAgentStore.getState().clearRewindBuffer();
            savedChatMessages = null;
            prevToastIdRef.current = null;
          },
        });
        prevToastIdRef.current = toastId;
      } finally {
        setExecuting(false);
        setOpen(false);
      }
    },
    [sessionId, messageId],
  );

  const hasFileChanges =
    dryRunResult?.canRewind && dryRunResult.filesChanged && dryRunResult.filesChanged.length > 0;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled || executing}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <RotateCcwIcon size={14} />
        <span className="sr-only">Rewind to this message</span>
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="start" sideOffset={4} className="w-64 !py-2 !px-0">
        <div className="flex flex-col">
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
            onClick={() => executeRewind(false)}
            disabled={executing}
          >
            Restore conversation only
          </button>
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <LoaderCircleIcon size={14} className="animate-spin" />
              Checking file changes...
            </div>
          ) : hasFileChanges ? (
            <button
              type="button"
              className="flex flex-col gap-0.5 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
              onClick={() => executeRewind(true)}
              disabled={executing}
            >
              <span>Restore code and conversation</span>
              <span className="text-xs text-muted-foreground">
                {dryRunResult!.filesChanged!.length} file
                {dryRunResult!.filesChanged!.length !== 1 ? "s" : ""} changed
                {dryRunResult!.insertions != null && ` +${dryRunResult!.insertions}`}
                {dryRunResult!.deletions != null && ` -${dryRunResult!.deletions}`}
              </span>
            </button>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
