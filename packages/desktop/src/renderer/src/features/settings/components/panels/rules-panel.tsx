import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/ui/button";
import { SettingsRow } from "../settings-row";

export const RulesPanel = () => {
  const { t } = useTranslation();

  const handleConfigureRules = () => {
    // TODO: Implement rules configuration logic
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <BookOpen className="size-[22px]" />
        {t("settings.rules")}
      </h1>

      <div className="space-y-0">
        <SettingsRow
          title={t("settings.rules.projectRules")}
          description={t("settings.rules.projectRules.description")}
        >
          <Button variant="outline" size="sm" onClick={handleConfigureRules}>
            {t("settings.rules.configureRules")}
          </Button>
        </SettingsRow>
      </div>
    </div>
  );
};
