import { HelpCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../components/ui/button";
import { Spinner } from "../../../../components/ui/spinner";
import { client } from "../../../../orpc";
import { useUpdaterState } from "../../../updater/hooks";
import { SettingsRow } from "../settings-row";

export const AboutPanel = () => {
  const { t } = useTranslation();
  const state = useUpdaterState();

  const [appVersion, setAppVersion] = useState("");
  const [sdkVersion, setSdkVersion] = useState("");
  useEffect(() => {
    client.updater.getVersion().then(setAppVersion);
    client.updater.getClaudeCodeSDKVersion().then(setSdkVersion);
  }, []);

  const getUpdateStatusText = (): string => {
    switch (state.status) {
      case "checking":
        return t("settings.about.checking");
      case "up-to-date":
        return t("settings.about.upToDate");
      case "available":
        return t("settings.about.newVersion", { version: state.version });
      case "ready":
        return t("settings.about.readyToInstall", { version: state.version });
      case "downloading":
        return t("settings.about.downloading", { version: state.version });
      case "error":
        return state.message ?? t("settings.about.error");
      case "idle":
      default:
        return t("settings.about.upToDate");
    }
  };

  const isBusy = state.status === "checking" || state.status === "downloading";

  const handleCheckForUpdates = () => {
    client.updater.check();
  };

  const handleSendFeedback = () => {
    window.open("https://github.com/neovateai/neovate-desktop/issues", "_blank");
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <HelpCircle className="size-[22px]" />
        {t("settings.about")}
      </h1>

      <div className="space-y-0">
        {/* Check for Updates */}
        <SettingsRow
          title={t("settings.about.checkForUpdates")}
          description={
            state.status === "error" ? (
              <span className="text-destructive">{state.message ?? t("settings.about.error")}</span>
            ) : (
              t("settings.about.currentVersion", {
                version: appVersion,
                status: getUpdateStatusText(),
              })
            )
          }
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckForUpdates}
            className="gap-2"
            disabled={isBusy}
          >
            {isBusy ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="size-3.5" />}
            {t("settings.about.checkForUpdates")}
          </Button>
        </SettingsRow>

        {/* Claude Code SDK Version */}
        <SettingsRow
          title={t("settings.about.sdkVersion")}
          description={t("settings.about.sdkVersion.description", { version: sdkVersion })}
        />

        {/* Feedback */}
        <SettingsRow
          title={t("settings.about.feedback")}
          description={t("settings.about.feedback.description")}
        >
          <Button variant="outline" size="sm" onClick={handleSendFeedback}>
            {t("settings.about.sendFeedback")}
          </Button>
        </SettingsRow>
      </div>
    </div>
  );
};
