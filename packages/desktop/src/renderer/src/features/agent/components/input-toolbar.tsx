import type { StoreApi } from "zustand";

import debug from "debug";
import {
  ArrowUp,
  ChevronDown,
  FolderOpen,
  Globe,
  Paperclip,
  RotateCw,
  Settings,
  Shield,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";
import { useConfigStore } from "../../config/store";
import { useProviderStore } from "../../provider/store";
import { useSettingsStore } from "../../settings/store";
import { claudeCodeChatManager } from "../chat-manager";
import { registerSessionInStore } from "../session-utils";
import { useAgentStore } from "../store";

const log = debug("neovate:input-toolbar");

// Track if model menu should reopen after provider switch (survives component remount)
let reopenModelMenuAfterSwitch = false;

type Props = {
  streaming: boolean;
  disabled?: boolean;
  sessionInitializing?: boolean;
  sessionInitError?: string | null;
  onRetry?: () => void;
  onSend: () => void;
  onCancel: () => void;
  onAttach: () => void;
  activeSessionId: string | null;
};

export function InputToolbar({
  streaming,
  disabled,
  sessionInitializing,
  sessionInitError,
  onRetry,
  onSend,
  onCancel,
  onAttach,
  activeSessionId,
}: Props) {
  const sendMessageWith = useConfigStore((s) => s.sendMessageWith);
  const networkInspector = useConfigStore((s) => s.networkInspector);

  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1 border-border/50 px-2 py-2 bg-background-secondary"
      role="toolbar"
      aria-label={t("chat.messageActions")}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={t("chat.attachImage")}
        onClick={onAttach}
        disabled={sessionInitializing}
      >
        <Paperclip className="h-4 w-4" />
      </Button>
      <ModelSelect activeSessionId={activeSessionId} disabled={disabled || streaming} />
      <PermissionModeSelect activeSessionId={activeSessionId} disabled={disabled || streaming} />
      {sessionInitError ? (
        <span className="text-xs text-destructive">
          {t("chat.sessionInitFailed")}
          {networkInspector && (
            <span className="text-muted-foreground ml-1">— {t("chat.sessionInitNetworkHint")}</span>
          )}
        </span>
      ) : sessionInitializing ? (
        <span className="text-xs text-muted-foreground animate-pulse">
          {t("chat.sessionInitializing")}
        </span>
      ) : null}
      <div className="flex-1" />
      {streaming ? (
        /* Streaming: subtle stop button with animated ring */
        <button
          type="button"
          className="relative flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-foreground transition-all duration-150 hover:bg-foreground/15 active:scale-95"
          onClick={onCancel}
        >
          <span className="absolute inset-0 rounded-full border border-foreground/20 animate-pulse" />
          <Square className="h-2.5 w-2.5 fill-current" />
        </button>
      ) : sessionInitError ? (
        /* Error: retry button */
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95"
          onClick={onRetry}
          title={t("chat.sessionInitRetry")}
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      ) : sessionInitializing ? (
        /* Initializing: subtle spinner */
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/50">
          <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : (
        /* Normal / Disabled states */
        <button
          type="button"
          className={
            disabled
              ? "flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground/40 cursor-not-allowed"
              : "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-150 hover:bg-primary/85 active:scale-95"
          }
          disabled={disabled}
          onClick={onSend}
          title={sendMessageWith === "cmdEnter" ? t("chat.sendCmdEnter") : t("chat.sendEnter")}
        >
          <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
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

const PERMISSION_MODE_HINT_KEYS = {
  default: "settings.chat.permissionMode.default.hint",
  acceptEdits: "settings.chat.permissionMode.acceptEdits.hint",
  plan: "settings.chat.permissionMode.plan.hint",
  bypassPermissions: "settings.chat.permissionMode.bypassPermissions.hint",
} as const;

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

  const modeOptions = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;

  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1 rounded-md bg-background-secondary px-2 text-xs text-muted-foreground outline-none disabled:opacity-50 hover:!bg-background/80 cursor-pointer"
      >
        <Shield className="h-3 w-3" />
        <span>{t(PERMISSION_MODE_I18N_KEYS[permissionMode])}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-52 p-1.5">
        <MenuRadioGroup value={permissionMode} onValueChange={handleSelect}>
          {modeOptions.map((mode) => (
            <MenuRadioItem key={mode} value={mode} className="!min-h-0 rounded-md py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight">
                  {t(PERMISSION_MODE_I18N_KEYS[mode])}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {t(PERMISSION_MODE_HINT_KEYS[mode])}
                </span>
              </div>
            </MenuRadioItem>
          ))}
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
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(() => {
    // Check if we should reopen menu after provider switch
    if (reopenModelMenuAfterSwitch) {
      reopenModelMenuAfterSwitch = false;
      return true;
    }
    return false;
  });
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
  const enabledProviders = providers.filter((p) => p.enabled);

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

      // Set flag to reopen menu after component remounts with new session
      reopenModelMenuAfterSwitch = true;

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

  // Helper to build model alias badge
  const getModelBadge = (p: (typeof providers)[0], key: string) => {
    const aliases: string[] = [];
    if (p.modelMap.model === key) aliases.push("default");
    if (p.modelMap.haiku === key) aliases.push("haiku");
    if (p.modelMap.opus === key) aliases.push("opus");
    if (p.modelMap.sonnet === key) aliases.push("sonnet");
    return aliases.length > 0 ? aliases.join(", ") : null;
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger className="inline-flex">
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger
            disabled={disabled}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-background-secondary px-2 text-xs text-muted-foreground outline-none disabled:opacity-50 hover:!bg-background/80 cursor-pointer"
          >
            <ScopeBadge scope={modelScope} />
            <span className="max-w-[200px] truncate">{buttonLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </MenuTrigger>
          <MenuPopup side="top" align="start" className="w-64 max-h-80 overflow-y-auto p-1">
            {/* Provider switcher header - only when multiple providers */}
            {enabledProviders.length > 0 && (
              <div className="px-2 py-1.5 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* SDK Default chip */}
                  <button
                    type="button"
                    disabled={hasMessages && !!providerId}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                      !providerId
                        ? "bg-primary/10 text-primary font-medium"
                        : hasMessages
                          ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                    }`}
                    title={hasMessages && providerId ? t("chat.providerSwitchHint") : undefined}
                    onClick={() => {
                      if (providerId && !hasMessages) {
                        handleProviderSwitch(null);
                      }
                    }}
                  >
                    {t("chat.sdkDefault")}
                  </button>
                  {/* Provider chips */}
                  {enabledProviders.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={hasMessages && providerId !== p.id}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                        providerId === p.id
                          ? "bg-primary/10 text-primary font-medium"
                          : hasMessages
                            ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                            : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                      }`}
                      title={
                        hasMessages && providerId !== p.id
                          ? t("chat.providerSwitchHint")
                          : undefined
                      }
                      onClick={() => {
                        if (providerId !== p.id && !hasMessages) {
                          handleProviderSwitch(p.id);
                        }
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Separator */}
            {enabledProviders.length > 0 && <div className="h-px bg-border mb-1" />}

            {/* Models for active provider */}
            {activeProvider ? (
              <MenuRadioGroup value={currentModel ?? ""} onValueChange={handleModelSelect}>
                {Object.entries(activeProvider.models).map(([key, entry]) => {
                  const badge = getModelBadge(activeProvider, key);
                  return (
                    <MenuRadioItem key={key} value={key} className="flex items-center gap-2">
                      <span className="flex-1 truncate">{entry.displayName ?? key}</span>
                      {badge && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {badge}
                        </span>
                      )}
                    </MenuRadioItem>
                  );
                })}
              </MenuRadioGroup>
            ) : availableModels ? (
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
            ) : null}

            {/* Manage Providers link */}
            <div className="h-px bg-border my-1" />
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              onClick={() => {
                useSettingsStore.getState().setActiveTab("providers");
                useSettingsStore.getState().setShowSettings(true);
              }}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>{t("chat.manageProviders")}</span>
            </button>
          </MenuPopup>
        </Menu>
      </ContextMenuTrigger>
      <ContextMenuPopup>
        <ContextMenuItem onClick={() => handleScopeAction("project")}>
          <FolderOpen className="h-4 w-4" />
          {t("chat.setProjectDefault")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleScopeAction("global")}>
          <Globe className="h-4 w-4" />
          {t("chat.setGlobalDefault")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => handleScopeAction("clear")}>
          {t("chat.clearSessionOverride")}
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
