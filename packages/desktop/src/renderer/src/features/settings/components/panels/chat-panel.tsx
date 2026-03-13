import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  ConfigPermissionMode,
  AgentLanguage,
  SendMessageWith,
} from "../../../../../../shared/features/config/types";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Spinner } from "../../../../components/ui/spinner";
import { ToggleOptions } from "../../../../components/ui/toggle-options";
import { useConfigStore } from "../../../config/store";
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
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <MessageSquare className="size-[22px]" />
        {t("settings.chat")}
      </h1>

      <div className="space-y-0">
        {/* Model - Coming Soon */}
        <SettingsRow
          title={t("settings.chat.model")}
          description={t("settings.chat.model.description")}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("settings.chat.comingSoon")}</span>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {t("settings.chat.requiresBackend")}
            </span>
          </div>
        </SettingsRow>

        {/* Agent Language */}
        <SettingsRow
          title={t("settings.chat.agentLanguage")}
          description={t("settings.chat.agentLanguage.description")}
        >
          <Select
            value={config.agentLanguage}
            onValueChange={(val) => setConfig("agentLanguage", val as AgentLanguage)}
          >
            <SelectTrigger size="sm" className="w-36">
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

        {/* Permission Mode */}
        <SettingsRow
          title={t("settings.chat.permissionMode")}
          description={t("settings.chat.permissionMode.description")}
        >
          <Select
            value={config.permissionMode}
            onValueChange={(val) => setConfig("permissionMode", val as ConfigPermissionMode)}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue>{t(permissionModeKeys[config.permissionMode])}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="default">{t("settings.chat.permissionMode.default")}</SelectItem>
              <SelectItem value="acceptEdits">
                {t("settings.chat.permissionMode.acceptEdits")}
              </SelectItem>
              <SelectItem value="bypassPermissions">
                {t("settings.chat.permissionMode.bypassPermissions")}
              </SelectItem>
            </SelectPopup>
          </Select>
        </SettingsRow>

        {/* Send Message With */}
        <SettingsRow
          title={t("settings.chat.sendMessage")}
          description={t("settings.chat.sendMessage.description")}
        >
          <ToggleOptions
            value={config.sendMessageWith}
            onChange={(val) => setConfig("sendMessageWith", val as SendMessageWith)}
            options={[
              { value: "enter", label: "Enter" },
              { value: "cmdEnter", label: "⌘+Enter" },
            ]}
          />
        </SettingsRow>
      </div>
    </div>
  );
};
