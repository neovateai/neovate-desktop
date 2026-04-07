import { HelpCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../components/ui/button";
import { Spinner } from "../../../../components/ui/spinner";
import { useRendererApp } from "../../../../core/app";
import { client } from "../../../../orpc";
import { useConfigStore } from "../../../config/store";
import { useUpdaterState } from "../../../updater/hooks";
import { SettingsRow } from "../settings-row";

export const AboutPanel = () => {
  const { t } = useTranslation();
  const state = useUpdaterState();

  const claudeCodeBinPath = useConfigStore((s) => s.claudeCodeBinPath);
  const [appVersion, setAppVersion] = useState("");
  const [sdkVersion, setSdkVersion] = useState("");
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    client.updater
      .getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(t("settings.about.unknownVersion")));
    client.updater
      .getClaudeCodeSDKVersion()
      .then(setSdkVersion)
      .catch(() => setSdkVersion(t("settings.about.unknownVersion")));
  }, [t]);

  // Auto-clear local IPC error when subscription recovers
  useEffect(() => {
    if (checkError && state.status !== "idle") {
      setCheckError(null);
    }
  }, [state]);

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
        if (state.message === "TIMEOUT") return t("settings.about.checkTimeout");
        return state.message ?? t("settings.about.error");
      case "idle":
      default:
        return t("settings.about.upToDate");
    }
  };

  const isBusy = state.status === "checking" || state.status === "downloading";

  const handleCheckForUpdates = () => {
    setCheckError(null);
    client.updater.check().catch(() => {
      setCheckError(t("settings.about.unableToCheck"));
    });
  };

  const DEFAULT_FEEDBACK_URL = "https://github.com/neovateai/neovate-desktop/issues";
  const { feedbackUrl } = useRendererApp().options.vendor ?? {};

  const handleSendFeedback = () => {
    window.open(feedbackUrl ?? DEFAULT_FEEDBACK_URL, "_blank");
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <HelpCircle className="size-5 text-primary" />
        </span>
        {t("settings.about")}
      </h1>

      <div className="space-y-0 rounded-xl bg-muted/30 border border-border/50 px-5 py-2">
        {/* Check for Updates */}
        <SettingsRow
          title={t("settings.about.checkForUpdates")}
          description={
            state.status === "error" ? (
              <span className="text-destructive">{getUpdateStatusText()}</span>
            ) : checkError ? (
              <span className="text-destructive">{checkError}</span>
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
          description={
            claudeCodeBinPath
              ? t("settings.about.sdkVersion.descriptionCustom", {
                  version: sdkVersion,
                  path: claudeCodeBinPath,
                })
              : t("settings.about.sdkVersion.description", { version: sdkVersion })
          }
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
