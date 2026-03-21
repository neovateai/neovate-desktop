import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { APP_NAME } from "../../../../../shared/constants";
import { getLogoUrl } from "../../../assets/images";
import { ProjectSelector } from "../../project/components/project-selector";

export function WelcomePanel() {
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-muted-foreground">
      <img
        src={getLogoUrl(resolvedTheme as "dark" | "light" | undefined)}
        className="h-24 w-auto object-contain"
        alt={`${APP_NAME} Logo`}
      />
      <p className="text-base text-center font-medium text-foreground/90">
        {t("chat.guideMessage", { APP_NAME })}
      </p>
      <div>
        <ProjectSelector variant="select" />
      </div>
    </div>
  );
}
