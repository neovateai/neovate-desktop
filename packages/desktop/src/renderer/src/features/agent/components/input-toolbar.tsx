import type { StoreApi } from "zustand";

import debug from "debug";
import {
  ChevronDown,
  FolderOpen,
  Globe,
  Paperclip,
  SendHorizonal,
  Settings,
  Shield,
  Square,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import type { ModelScope, PermissionMode } from "../../../../../shared/features/agent/types";
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
import { useConfigStore } from "../../config/store";
import { useProviderStore } from "../../provider/store";
import { useSettingsStore } from "../../settings/store";
import { claudeCodeChatManager } from "../chat-manager";
import { registerSessionInStore } from "../session-utils";
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
  const sendMessageWith = useConfigStore((s) => s.sendMessageWith);

  return (
    <div className="flex items-center gap-1 border-border/50 px-2 py-1 bg-background-secondary">
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
      <PermissionModeSelect activeSessionId={activeSessionId} disabled={disabled || streaming} />
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
        <Button
          type="button"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          onClick={onSend}
          title={sendMessageWith === "cmdEnter" ? "Send (⌘+Enter)" : "Send (Enter)"}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

const PERMISSION_MODE_I18N_KEYS = {
  default: "settings.chat.permissionMode.default",
  acceptEdits: "settings.chat.permissionMode.acceptEdits",
  plan: "settings.chat.permissionMode.plan",
  bypassPermissions: "settings.chat.permissionMode.bypassPermissions",
  dontAsk: "settings.chat.permissionMode.dontAsk",
} as const satisfies Record<PermissionMode, string>;

function PermissionModeSelect({
  activeSessionId,
  disabled,
}: {
  activeSessionId: string | null;
  disabled: boolean;
}) {
  if (!activeSessionId) return null;

  return <ConnectedPermissionModeSelect activeSessionId={activeSessionId} disabled={disabled} />;
}

function ConnectedPermissionModeSelect({
  activeSessionId,
  disabled,
}: {
  activeSessionId: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const permissionMode = useAgentStore(
    (s) => s.sessions.get(activeSessionId)?.permissionMode ?? "default",
  );
  const setPermissionMode = useAgentStore((s) => s.setPermissionMode);

  const handleSelect = useCallback(
    (value: unknown) => {
      const mode = value as PermissionMode;
      log("handlePermissionModeSelect: mode=%s sessionId=%s", mode, activeSessionId);
      setPermissionMode(activeSessionId, mode);
      claudeCodeChatManager.getChat(activeSessionId)?.dispatch({
        kind: "configure",
        configure: { type: "set_permission_mode", mode },
      });
    },
    [activeSessionId, setPermissionMode],
  );

  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1 rounded-md bg-background-secondary px-2 text-xs text-muted-foreground outline-none disabled:opacity-50"
      >
        <Shield className="h-3 w-3" />
        <span>{t(PERMISSION_MODE_I18N_KEYS[permissionMode])}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </MenuTrigger>
      <MenuPopup side="top" align="start">
        <MenuRadioGroup value={permissionMode} onValueChange={handleSelect}>
          <MenuRadioItem value="default">{t("settings.chat.permissionMode.default")}</MenuRadioItem>
          <MenuRadioItem value="acceptEdits">
            {t("settings.chat.permissionMode.acceptEdits")}
          </MenuRadioItem>
          <MenuRadioItem value="plan">{t("settings.chat.permissionMode.plan")}</MenuRadioItem>
          <MenuRadioItem value="bypassPermissions">
            {t("settings.chat.permissionMode.bypassPermissions")}
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
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
  const providerId = useAgentStore((s) => s.sessions.get(activeSessionId)?.providerId);
  const hasMessages = useAgentStore(
    (s) => (s.sessions.get(activeSessionId)?.messages.length ?? 0) > 0,
  );
  const availableModels = useStore(chatStore, (state) => state.capabilities?.models);

  // Provider state
  const providers = useProviderStore((s) => s.providers);
  const loaded = useProviderStore((s) => s.loaded);
  const loadProviders = useProviderStore((s) => s.load);

  useEffect(() => {
    if (!loaded) loadProviders();
  }, [loaded, loadProviders]);

  const activeProvider = providerId ? providers.find((p) => p.id === providerId) : undefined;

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
      const model = currentModel ?? null;
      log(
        "setModelSetting: scope=%s model=%s sessionId=%s providerId=%s",
        scope,
        model,
        activeSessionId,
        providerId ?? "(sdk)",
      );
      if (providerId) {
        if (!model) return;
        // Provider active: only write to our provider config files
        client.provider.setSelection({
          sessionId: activeSessionId,
          providerId,
          model,
          scope,
        });
      } else {
        // SDK Default: write to .claude/ settings files (model can be null to just clear provider)
        client.agent.setModelSetting({ sessionId: activeSessionId, model, scope });
      }
    },
    [activeSessionId, currentModel, providerId, setCurrentModel, setModelScope],
  );

  const sessionCwd = useAgentStore((s) => s.sessions.get(activeSessionId)?.cwd);

  /** Switch to a different provider by closing the empty session and creating a new one. */
  const handleProviderSwitch = useCallback(
    async (newProviderId: string | null) => {
      if (hasMessages) return;
      const isSame = newProviderId === (providerId ?? null);
      if (isSame) return;
      const cwd = sessionCwd;
      if (!cwd) return;

      log(
        "handleProviderSwitch: from=%s to=%s cwd=%s",
        providerId ?? "(sdk)",
        newProviderId ?? "(sdk)",
        cwd,
      );

      // Remove old empty session
      const oldSessionId = activeSessionId;
      useAgentStore.getState().removeSession(oldSessionId);
      claudeCodeChatManager.removeSession(oldSessionId);

      // Create new session with explicit provider
      const {
        sessionId,
        commands,
        models,
        currentModel: cm,
        modelScope: ms,
        providerId: pid,
      } = await claudeCodeChatManager.createSession(cwd, { providerId: newProviderId });

      registerSessionInStore(
        sessionId,
        cwd,
        { commands, models, currentModel: cm, modelScope: ms, providerId: pid },
        true,
      );
    },
    [activeSessionId, providerId, hasMessages, sessionCwd],
  );

  // Build model list: from provider catalog or SDK capabilities
  const modelItems = activeProvider
    ? Object.entries(activeProvider.models).map(([key, entry]) => {
        // Build alias badges
        const aliases: string[] = [];
        const mm = activeProvider.modelMap;
        if (mm.model === key) aliases.push("default");
        if (mm.haiku === key) aliases.push("haiku");
        if (mm.opus === key) aliases.push("opus");
        if (mm.sonnet === key) aliases.push("sonnet");
        const badge = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";
        return {
          value: key,
          displayName: (entry.displayName ?? key) + badge,
        };
      })
    : (availableModels ?? []).map((m) => ({ value: m.value, displayName: m.displayName }));

  if (modelItems.length === 0 && !activeProvider) return null;

  // Display label
  const providerLabel = activeProvider?.name;
  const modelLabel = activeProvider
    ? (activeProvider.models[currentModel ?? ""]?.displayName ??
      currentModel ??
      Object.keys(activeProvider.models)[0])
    : (availableModels?.find((m) => m.value === currentModel)?.displayName ??
      currentModel ??
      availableModels?.[0]?.displayName);
  const buttonLabel = providerLabel ? `${providerLabel} / ${modelLabel}` : modelLabel;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="inline-flex">
        <Menu>
          <MenuTrigger
            disabled={disabled}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-background-secondary px-2 text-xs text-muted-foreground outline-none disabled:opacity-50"
          >
            <ScopeBadge scope={modelScope} />
            <span className="max-w-[200px] truncate">{buttonLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </MenuTrigger>
          <MenuPopup side="top" align="start" className="max-h-80 overflow-y-auto">
            {/* Provider groups — only show when providers exist */}
            {providers.filter((p) => p.enabled).length > 0 && (
              <>
                {providers
                  .filter((p) => p.enabled)
                  .map((p) => (
                    <div key={p.id}>
                      <div
                        className={`px-3 py-1.5 text-xs font-medium ${
                          providerId === p.id
                            ? "text-foreground"
                            : hasMessages
                              ? "text-muted-foreground/50 cursor-not-allowed"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                        }`}
                        title={
                          hasMessages && providerId !== p.id
                            ? "Provider switch requires a new session"
                            : undefined
                        }
                        onClick={() => {
                          if (providerId !== p.id && !hasMessages) {
                            handleProviderSwitch(p.id);
                          }
                        }}
                      >
                        {providerId === p.id ? "\u2022 " : "\u25CB "}
                        {p.name}
                      </div>
                      {providerId === p.id && (
                        <MenuRadioGroup
                          value={currentModel ?? ""}
                          onValueChange={handleModelSelect}
                        >
                          {Object.entries(p.models).map(([key, entry]) => {
                            const aliases: string[] = [];
                            if (p.modelMap.model === key) aliases.push("default");
                            if (p.modelMap.haiku === key) aliases.push("haiku");
                            if (p.modelMap.opus === key) aliases.push("opus");
                            if (p.modelMap.sonnet === key) aliases.push("sonnet");
                            const badge = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";
                            return (
                              <MenuRadioItem key={key} value={key} className="pl-6">
                                {(entry.displayName ?? key) + badge}
                              </MenuRadioItem>
                            );
                          })}
                        </MenuRadioGroup>
                      )}
                    </div>
                  ))}
                <div className="h-px bg-border my-1" />
              </>
            )}

            {/* SDK Default section */}
            <div>
              {providers.filter((p) => p.enabled).length > 0 && (
                <div
                  className={`px-3 py-1.5 text-xs font-medium ${
                    !providerId
                      ? "text-foreground"
                      : hasMessages
                        ? "text-muted-foreground/50 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                  }`}
                  title={
                    hasMessages && providerId ? "Provider switch requires a new session" : undefined
                  }
                  onClick={() => {
                    if (providerId && !hasMessages) {
                      handleProviderSwitch(null);
                    }
                  }}
                >
                  {!providerId ? "\u2022 " : "\u25CB "}
                  SDK Default
                </div>
              )}
              {!providerId && availableModels && (
                <MenuRadioGroup
                  value={currentModel ?? availableModels[0]?.value ?? ""}
                  onValueChange={handleModelSelect}
                >
                  {availableModels.map((m) => (
                    <MenuRadioItem
                      key={m.value}
                      value={m.value}
                      className={providers.filter((p) => p.enabled).length > 0 ? "pl-6" : ""}
                    >
                      {m.displayName}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              )}
            </div>

            {/* Manage Providers link */}
            {providers.length > 0 && <div className="h-px bg-border my-1" />}
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
              onClick={() => {
                useSettingsStore.getState().setActiveTab("providers");
                useSettingsStore.getState().setShowSettings(true);
              }}
            >
              <Settings className="h-3 w-3" />
              Manage Providers...
            </button>
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
