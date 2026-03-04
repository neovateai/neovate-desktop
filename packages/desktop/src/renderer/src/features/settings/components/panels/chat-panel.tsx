import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfigStore } from "../../../config/store";
import type {
  ApprovalMode,
  NotificationSound,
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
import { SettingsRow } from "../settings-row";

// Translation key mappings
const agentLanguageKeys: Record<AgentLanguage, string> = {
  English: "settings.chat.agentLanguage.english",
  Chinese: "settings.chat.agentLanguage.chinese",
};

const approvalModeKeys: Record<ApprovalMode, string> = {
  default: "settings.chat.approvalMode.default",
  autoEdit: "settings.chat.approvalMode.autoEdit",
  yolo: "settings.chat.approvalMode.yolo",
};

const notificationSoundKeys: Record<NotificationSound, string> = {
  off: "settings.chat.notification.off",
  default: "settings.chat.notification.default",
  Glass: "settings.chat.notification.glass",
  Ping: "settings.chat.notification.ping",
  Pop: "settings.chat.notification.pop",
  Funk: "settings.chat.notification.funk",
};

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

        {/* Small Model - Coming Soon */}
        <SettingsRow
          title={t("settings.chat.smallModel")}
          description={t("settings.chat.smallModel.description")}
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

        {/* Approval Mode */}
        <SettingsRow
          title={t("settings.chat.approvalMode")}
          description={t("settings.chat.approvalMode.description")}
        >
          <Select
            value={config.approvalMode}
            onValueChange={(val) => setConfig("approvalMode", val as ApprovalMode)}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue>{t(approvalModeKeys[config.approvalMode])}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="default">{t("settings.chat.approvalMode.default")}</SelectItem>
              <SelectItem value="autoEdit">{t("settings.chat.approvalMode.autoEdit")}</SelectItem>
              <SelectItem value="yolo">{t("settings.chat.approvalMode.yolo")}</SelectItem>
            </SelectPopup>
          </Select>
        </SettingsRow>

        {/* Notification */}
        <SettingsRow
          title={t("settings.chat.notification")}
          description={t("settings.chat.notification.description")}
        >
          <Select
            value={config.notificationSound}
            onValueChange={(val) => setConfig("notificationSound", val as NotificationSound)}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue>{t(notificationSoundKeys[config.notificationSound])}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="off">{t("settings.chat.notification.off")}</SelectItem>
              <SelectItem value="default">{t("settings.chat.notification.default")}</SelectItem>
              <SelectItem value="Glass">{t("settings.chat.notification.glass")}</SelectItem>
              <SelectItem value="Ping">{t("settings.chat.notification.ping")}</SelectItem>
              <SelectItem value="Pop">{t("settings.chat.notification.pop")}</SelectItem>
              <SelectItem value="Funk">{t("settings.chat.notification.funk")}</SelectItem>
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
