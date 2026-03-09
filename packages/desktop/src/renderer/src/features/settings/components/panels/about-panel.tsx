import { HelpCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../components/ui/button";
import { Spinner } from "../../../../components/ui/spinner";
import { SettingsRow } from "../settings-row";

type UpdaterStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

interface UpdaterState {
  status: UpdaterStatus;
  version?: string;
  message?: string;
}

export const AboutPanel = () => {
  const { t } = useTranslation();
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [updaterState, setUpdaterState] = useState<UpdaterState>({
    status: "idle",
  });

  // Get update status description text
  const getUpdateStatusText = (state: UpdaterState): string => {
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

  useEffect(() => {
    // TODO: Get initial version and update state via oRPC
    // For now, set a placeholder
    setAppVersion("1.0.0");
    setUpdaterState({ status: "idle" });
  }, []);

  const handleSendFeedback = () => {
    // TODO: Open external URL via oRPC
    window.open("https://github.com/neovateai/neovate-desktop/issues", "_blank");
  };

  const handleCheckForUpdates = async () => {
    if (isCheckingForUpdates) return;
    setIsCheckingForUpdates(true);

    try {
      // TODO: Call oRPC updater.check() when available
      setUpdaterState({ status: "checking" });
      // Simulate checking
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setUpdaterState({ status: "up-to-date" });
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdaterState({ status: "error", message: t("settings.about.unableToCheck") });
    } finally {
      setIsCheckingForUpdates(false);
    }
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
          description={t("settings.about.currentVersion", {
            version: appVersion,
            status: getUpdateStatusText(updaterState),
          })}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckForUpdates}
            className="gap-2"
            disabled={isCheckingForUpdates}
          >
            {isCheckingForUpdates ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {t("settings.about.checkForUpdates")}
          </Button>
        </SettingsRow>

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
