import type { StoreApi } from "zustand";

import debug from "debug";
import { ChevronDown, FolderOpen, Globe, Paperclip, SendHorizonal, Square } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import type { ModelScope } from "../../../../../shared/features/agent/types";
import type { ClaudeCodeChatStoreState } from "../chat-state";

import { Button } from "../../../components/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuPopup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../../components/ui/context-menu";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
} from "../../../components/ui/menu";
import { client } from "../../../orpc";
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

function ScopeBadge({ scope }: { scope?: ModelScope }) {
  if (scope === "project") return <FolderOpen className="h-3 w-3 text-muted-foreground" />;
  if (scope === "global") return <Globe className="h-3 w-3 text-muted-foreground" />;
  return null;
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
  const setModelScope = useAgentStore((s) => s.setModelScope);
  const currentModel = useAgentStore((s) => s.sessions.get(activeSessionId)?.currentModel);
  const modelScope = useAgentStore((s) => s.sessions.get(activeSessionId)?.modelScope);
  const availableModels = useStore(chatStore, (state) => state.capabilities?.models);

  const handleModelSelect = useCallback(
    (value: unknown) => {
      const model = value as string;
      log("handleModelSelect: model=%s sessionId=%s", model, activeSessionId);
      setCurrentModel(activeSessionId, model);
      setModelScope(activeSessionId, "session");
      claudeCodeChatManager.getChat(activeSessionId)?.dispatch({
        kind: "configure",
        configure: { type: "set_model", model },
      });
      client.agent.setModelSetting({ sessionId: activeSessionId, model, scope: "session" });
    },
    [activeSessionId, setCurrentModel, setModelScope],
  );

  const handleScopeAction = useCallback(
    (scope: ModelScope | "clear") => {
      if (scope === "clear") {
        log("clearSessionOverride: sessionId=%s", activeSessionId);
        client.agent
          .setModelSetting({ sessionId: activeSessionId, model: null, scope: "session" })
          .then((result) => {
            if (result.currentModel) {
              setCurrentModel(activeSessionId, result.currentModel);
            }
            setModelScope(activeSessionId, result.modelScope);
          });
        return;
      }
      const model = currentModel;
      if (!model) return;
      log("setModelSetting: scope=%s model=%s sessionId=%s", scope, model, activeSessionId);
      client.agent.setModelSetting({ sessionId: activeSessionId, model, scope });
    },
    [activeSessionId, currentModel, setCurrentModel, setModelScope],
  );

  if (!availableModels || availableModels.length === 0) return null;

  const displayModel =
    availableModels.find((m) => m.value === currentModel)?.displayName ??
    currentModel ??
    availableModels[0]?.displayName;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="inline-flex">
        <Menu>
          <MenuTrigger
            disabled={disabled}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <ScopeBadge scope={modelScope} />
            <span>{displayModel}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </MenuTrigger>
          <MenuPopup side="top" align="start">
            <MenuRadioGroup
              value={currentModel ?? availableModels[0]?.value ?? ""}
              onValueChange={handleModelSelect}
            >
              {availableModels.map((m) => (
                <MenuRadioItem key={m.value} value={m.value}>
                  {m.displayName}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuPopup>
        </Menu>
      </ContextMenuTrigger>
      <ContextMenuPopup>
        <ContextMenuItem onClick={() => handleScopeAction("project")}>
          <FolderOpen className="h-4 w-4" />
          Set as project default
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleScopeAction("global")}>
          <Globe className="h-4 w-4" />
          Set as global default
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => handleScopeAction("clear")}>
          Clear session override
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
