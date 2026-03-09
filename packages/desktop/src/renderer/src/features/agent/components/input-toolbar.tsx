import type { StoreApi } from "zustand";

import debug from "debug";
import { SendHorizonal, Square, Paperclip } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import type { ClaudeCodeChatStoreState } from "../chat-state";

import { Button } from "../../../components/ui/button";
import { claudeCodeChatManager } from "../chat-manager";
import { useAgentStore } from "../store";

const log = debug("neovate:input-toolbar");

type Props = {
  streaming: boolean;
  disabled?: boolean;
  onSend: () => void;
  onCancel: () => void;
  onAttach: () => void;
  activeSessionId: string | null;
};

export function InputToolbar({
  streaming,
  disabled,
  onSend,
  onCancel,
  onAttach,
  activeSessionId,
}: Props) {
  return (
    <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Attach image"
        onClick={onAttach}
      >
        <Paperclip className="h-4 w-4" />
      </Button>
      <ModelSelect activeSessionId={activeSessionId} disabled={disabled || streaming} />
      <div className="flex-1" />
      {streaming ? (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-7 w-7"
          onClick={onCancel}
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button type="button" size="icon" className="h-7 w-7" disabled={disabled} onClick={onSend}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function ModelSelect({
  activeSessionId,
  disabled,
}: {
  activeSessionId: string | null;
  disabled: boolean;
}) {
  const chat = activeSessionId ? claudeCodeChatManager.getChat(activeSessionId) : undefined;
  if (!activeSessionId || !chat) return null;

  return (
    <ConnectedModelSelect
      activeSessionId={activeSessionId}
      chatStore={chat.store}
      disabled={disabled}
    />
  );
}

function ConnectedModelSelect({
  activeSessionId,
  chatStore,
  disabled,
}: {
  activeSessionId: string;
  chatStore: StoreApi<ClaudeCodeChatStoreState>;
  disabled: boolean;
}) {
  const setCurrentModel = useAgentStore((s) => s.setCurrentModel);
  const currentModel = useAgentStore((s) => s.sessions.get(activeSessionId)?.currentModel);
  const availableModels = useStore(chatStore, (state) => state.capabilities?.models);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value;
      log("handleModelChange: model=%s sessionId=%s", model, activeSessionId);
      setCurrentModel(activeSessionId, model);
      claudeCodeChatManager.getChat(activeSessionId)?.dispatch({
        kind: "configure",
        configure: { type: "set_model", model },
      });
    },
    [activeSessionId, setCurrentModel],
  );

  if (!availableModels || availableModels.length === 0) return null;

  return (
    <select
      value={currentModel ?? availableModels[0]?.value ?? ""}
      onChange={handleChange}
      disabled={disabled}
      className="h-7 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      title="Select model"
    >
      {availableModels.map((m) => (
        <option key={m.value} value={m.value}>
          {m.displayName}
        </option>
      ))}
    </select>
  );
}
