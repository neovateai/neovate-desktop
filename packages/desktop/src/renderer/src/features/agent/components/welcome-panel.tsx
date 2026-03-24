import { FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { APP_NAME } from "../../../../../shared/constants";
import { getLogoUrl } from "../../../assets/images";
import { Button } from "../../../components/ui/button";
import { ProjectSelector } from "../../project/components/project-selector";
import { useProject } from "../../project/hooks/use-project";

type WelcomePanelProps = {
  hasProject?: boolean;
};

export function WelcomePanel({ hasProject }: WelcomePanelProps) {
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const { openProject, loading } = useProject();

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
      {hasProject ? (
        <div>
          <ProjectSelector variant="select" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">{t("project.getStarted")}</p>
          <Button variant="outline" onClick={openProject} disabled={loading}>
            <HugeiconsIcon icon={FolderIcon} size={16} strokeWidth={1.5} />
            {t("project.openProject")}
          </Button>
        </div>
      )}
    </div>
  );
}
