import debug from "debug";
import { ChevronDown, Code, Hand, MessageSquare, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ConfigPermissionMode,
  AgentLanguage,
  SendMessageWith,
} from "../../../../../../shared/features/config/types";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../../../../components/ui/menu";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Spinner } from "../../../../components/ui/spinner";
import { Switch } from "../../../../components/ui/switch";
import { ToggleOptions } from "../../../../components/ui/toggle-options";
import { client } from "../../../../orpc";
import { claudeCodeChatManager } from "../../../agent/chat-manager";
import { useAgentStore } from "../../../agent/store";
import { useConfigStore } from "../../../config/store";
import { useProjectStore } from "../../../project/store";
import { useProviderStore } from "../../../provider/store";
import { SettingsGroup } from "../settings-group";
import { SettingsRow } from "../settings-row";

// Translation key mappings
const agentLanguageKeys = {
  English: "settings.chat.agentLanguage.english",
  Chinese: "settings.chat.agentLanguage.chinese",
} as const satisfies Record<AgentLanguage, string>;

const permissionModeKeys = {
  default: "settings.chat.permissionMode.default",
  acceptEdits: "settings.chat.permissionMode.acceptEdits",
  bypassPermissions: "settings.chat.permissionMode.bypassPermissions",
} as const satisfies Record<ConfigPermissionMode, string>;

const EMPTY_MODELS: import("../../../../../../shared/features/agent/types").ModelInfo[] = [];

/** Encode provider+model into a single radio value. "" = auto. */
function encodeValue(providerId: string | undefined, model: string | undefined): string {
  if (!model) return "";
  return providerId ? `${providerId}:${model}` : `:${model}`;
}

/** Decode radio value back to providerId + model. */
function decodeValue(value: string): { providerId: string | null; model: string | null } {
  if (!value) return { providerId: null, model: null };
  const idx = value.indexOf(":");
  const providerId = value.slice(0, idx) || null;
  const model = value.slice(idx + 1) || null;
  return { providerId, model };
}

export const ChatPanel = () => {
  const { t } = useTranslation();

  // Get all config values and the generic setter
  const config = useConfigStore();
  const setConfig = useConfigStore((s) => s.setConfig);
  const loaded = useConfigStore((s) => s.loaded);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <MessageSquare className="size-5 text-primary" />
        </span>
        {t("settings.chat")}
      </h1>

      <div className="space-y-5">
        {/* Model */}
        <SettingsGroup title={t("settings.chat.group.model")}>
          <SettingsRow
            title={t("settings.chat.model")}
            description={t("settings.chat.model.description")}
          >
            <GlobalModelSelect />
          </SettingsRow>
        </SettingsGroup>

        {/* Behavior */}
        <SettingsGroup title={t("settings.chat.group.behavior")}>
          <SettingsRow
            title={t("settings.chat.agentLanguage")}
            description={t("settings.chat.agentLanguage.description")}
          >
            <Select
              value={config.agentLanguage}
              onValueChange={(val) => setConfig("agentLanguage", val as AgentLanguage)}
            >
              <SelectTrigger size="sm" className="min-w-36">
                <SelectValue placeholder={t("settings.chat.selectPlaceholder")}>
                  {t(agentLanguageKeys[config.agentLanguage])}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="English">{t("settings.chat.agentLanguage.english")}</SelectItem>
                <SelectItem value="Chinese">{t("settings.chat.agentLanguage.chinese")}</SelectItem>
              </SelectPopup>
            </Select>
          </SettingsRow>

          <SettingsRow
            title={t("settings.chat.permissionMode")}
            description={t("settings.chat.permissionMode.description")}
          >
            <Select
              value={config.permissionMode}
              onValueChange={(val) => setConfig("permissionMode", val as ConfigPermissionMode)}
            >
              <SelectTrigger size="sm" className="min-w-36">
                <SelectValue>{t(permissionModeKeys[config.permissionMode])}</SelectValue>
              </SelectTrigger>
              <SelectPopup className="min-w-52">
                <SelectItem
                  value="default"
                  className="items-start py-1 grid-cols-[1fr_auto] pe-2 [&>:first-child]:col-start-2 [&>:first-child]:row-start-1 [&>:last-child]:col-start-1"
                >
                  <div className="flex items-start gap-2">
                    <Hand className="size-3.5 mt-px shrink-0 opacity-60" />
                    <div className="flex flex-col">
                      <span className="text-xs">{t("settings.chat.permissionMode.default")}</span>
                      <span className="text-[10px] leading-tight text-muted-foreground/80 font-normal">
                        {t("settings.chat.permissionMode.default.desc")}
                      </span>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem
                  value="acceptEdits"
                  className="items-start py-1 grid-cols-[1fr_auto] pe-2 [&>:first-child]:col-start-2 [&>:first-child]:row-start-1 [&>:last-child]:col-start-1"
                >
                  <div className="flex items-start gap-2">
                    <Code className="size-3.5 mt-px shrink-0 opacity-60" />
                    <div className="flex flex-col">
                      <span className="text-xs">
                        {t("settings.chat.permissionMode.acceptEdits")}
                      </span>
                      <span className="text-[10px] leading-tight text-muted-foreground/80 font-normal">
                        {t("settings.chat.permissionMode.acceptEdits.desc")}
                      </span>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem
                  value="bypassPermissions"
                  className="items-start py-1 grid-cols-[1fr_auto] pe-2 [&>:first-child]:col-start-2 [&>:first-child]:row-start-1 [&>:last-child]:col-start-1"
                >
                  <div className="flex items-start gap-2">
                    <TriangleAlert className="size-3.5 mt-px shrink-0 opacity-60" />
                    <div className="flex flex-col">
                      <span className="text-xs">
                        {t("settings.chat.permissionMode.bypassPermissions")}
                      </span>
                      <span className="text-[10px] leading-tight text-muted-foreground/80 font-normal">
                        {t("settings.chat.permissionMode.bypassPermissions.desc")}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              </SelectPopup>
            </Select>
          </SettingsRow>

          <SettingsRow
            title={t("settings.chat.tokenOptimization")}
            description={t("settings.chat.tokenOptimization.description")}
          >
            <Switch
              checked={config.tokenOptimization}
              onCheckedChange={(v) => setConfig("tokenOptimization", v)}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.chat.networkInspector")}
            description={t("settings.chat.networkInspector.description")}
          >
            <Switch
              checked={config.networkInspector}
              onCheckedChange={(v) => setConfig("networkInspector", v)}
            />
          </SettingsRow>

          <SettingsRow
            title={t("settings.chat.keepAwake")}
            description={t("settings.chat.keepAwake.description")}
          >
            <Switch checked={config.keepAwake} onCheckedChange={(v) => setConfig("keepAwake", v)} />
          </SettingsRow>

          <SettingsRow
            title={t("settings.chat.sendMessage")}
            description={t("settings.chat.sendMessage.description")}
          >
            <ToggleOptions
              value={config.sendMessageWith}
              onChange={(val) => setConfig("sendMessageWith", val as SendMessageWith)}
              options={[
                { value: "enter", label: "Enter" },
                {
                  value: "cmdEnter",
                  label: /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? "⌘+Enter" : "Ctrl+Enter",
                },
              ]}
            />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};

const log = debug("neovate:settings:chat");

function GlobalModelSelect() {
  const { t } = useTranslation();

  // Current global selection state
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [selectionLoaded, setSelectionLoaded] = useState(false);

  // Providers
  const providers = useProviderStore((s) => s.providers);
  const providersLoaded = useProviderStore((s) => s.loaded);
  const loadProviders = useProviderStore((s) => s.load);

  // SDK models from any active non-provider session
  const sdkModels = useAgentStore((s) => {
    for (const session of s.sessions.values()) {
      if (!session.providerId && session.availableModels.length > 0) {
        return session.availableModels;
      }
    }
    return EMPTY_MODELS;
  });

  // Load providers and current selection on mount
  useEffect(() => {
    if (!providersLoaded) loadProviders();
  }, [providersLoaded, loadProviders]);

  useEffect(() => {
    client.config.getGlobalModelSelection().then((sel) => {
      setSelectedProviderId(sel.providerId);
      setSelectedModel(sel.model);
      setSelectionLoaded(true);
    });
  }, []);

  const enabledProviders = providers.filter((p) => p.enabled);

  const handleSelect = useCallback((value: unknown) => {
    const { providerId, model } = decodeValue(value as string);
    log("global model selection: providerId=%s model=%s", providerId, model);
    setSelectedProviderId(providerId ?? undefined);
    setSelectedModel(model ?? undefined);
    client.config.setGlobalModelSelection({ providerId, model });
    const projectPath = useProjectStore.getState().activeProject?.path;
    claudeCodeChatManager.invalidateNewSessions(projectPath);
  }, []);

  if (!selectionLoaded) {
    return <Spinner className="h-4 w-4" />;
  }

  // Build display label
  const activeProvider = selectedProviderId
    ? enabledProviders.find((p) => p.id === selectedProviderId)
    : undefined;
  const autoLabel = t("settings.chat.model.auto");

  let displayLabel: string;
  if (!selectedModel) {
    displayLabel = autoLabel;
  } else if (activeProvider) {
    const modelDisplay = activeProvider.models[selectedModel]?.displayName ?? selectedModel;
    displayLabel = `${activeProvider.name} / ${modelDisplay}`;
  } else {
    const sdkModel = sdkModels.find((m) => m.value === selectedModel);
    displayLabel = sdkModel?.displayName ?? selectedModel;
  }

  const currentValue = encodeValue(selectedProviderId, selectedModel);

  return (
    <Menu>
      <MenuTrigger className="inline-flex h-8 max-w-[220px] items-center gap-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none hover:bg-accent cursor-pointer">
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </MenuTrigger>
      <MenuPopup side="bottom" align="end" className="max-h-80 overflow-y-auto">
        <MenuRadioGroup value={currentValue} onValueChange={handleSelect}>
          {/* Default (auto) */}
          <MenuRadioItem value="">{autoLabel}</MenuRadioItem>

          <MenuSeparator />

          {/* SDK Default models */}
          {enabledProviders.length > 0 && (
            <MenuGroup>
              <MenuGroupLabel>{t("settings.chat.model.sdkDefault")}</MenuGroupLabel>
            </MenuGroup>
          )}
          {sdkModels.map((m) => (
            <MenuRadioItem
              key={m.value}
              value={encodeValue(undefined, m.value)}
              className={enabledProviders.length > 0 ? "pl-6" : ""}
            >
              {m.displayName}
            </MenuRadioItem>
          ))}

          {/* Provider groups */}
          {enabledProviders.map((p) => (
            <MenuGroup key={p.id}>
              <MenuSeparator />
              <MenuGroupLabel>{p.name}</MenuGroupLabel>
              {Object.entries(p.models).map(([key, entry]) => {
                const aliases: string[] = [];
                if (p.modelMap.model === key) aliases.push("default");
                if (p.modelMap.haiku === key) aliases.push("haiku");
                if (p.modelMap.opus === key) aliases.push("opus");
                if (p.modelMap.sonnet === key) aliases.push("sonnet");
                const badge = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";
                return (
                  <MenuRadioItem key={key} value={encodeValue(p.id, key)} className="pl-6">
                    {(entry.displayName ?? key) + badge}
                  </MenuRadioItem>
                );
              })}
            </MenuGroup>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
