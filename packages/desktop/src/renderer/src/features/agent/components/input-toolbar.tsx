import { useCallback } from "react";
import debug from "debug";
import { Button } from "../../../components/ui/button";
import { SendHorizonal, Square, Paperclip } from "lucide-react";
import { useAgentStore } from "../store";
import { client } from "../../../orpc";
import type { ModelInfo } from "../../../../../shared/features/agent/types";

const log = debug("neovate:input-toolbar");

type Props = {
  streaming: boolean;
  disabled?: boolean;
  onSend: () => void;
  onCancel: () => void;
  onAttach: () => void;
  availableModels?: ModelInfo[];
  currentModel?: string;
  activeSessionId: string | null;
};

export function InputToolbar({
  streaming,
  disabled,
  onSend,
  onCancel,
  onAttach,
  availableModels,
  currentModel,
  activeSessionId,
}: Props) {
  const setCurrentModel = useAgentStore((s) => s.setCurrentModel);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value;
      if (!activeSessionId) return;
      log("handleModelChange: model=%s sessionId=%s", model, activeSessionId);
      setCurrentModel(activeSessionId, model);
      client.agent.setModel({ sessionId: activeSessionId, model });
      client.agent.setModelSetting({ sessionId: activeSessionId, model });
    },
    [activeSessionId, setCurrentModel],
  );

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
      {availableModels && availableModels.length > 0 && (
        <select
          value={currentModel ?? ""}
          onChange={handleModelChange}
          disabled={disabled || streaming}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          title="Select model"
        >
          {availableModels.map((m) => (
            <option key={m.value} value={m.value}>
              {m.displayName}
            </option>
          ))}
        </select>
      )}
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
