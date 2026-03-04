import { Code } from "lucide-react";
import { useTranslation } from "react-i18next";

export const MCPPanel = () => {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <Code className="size-[22px]" />
        {t("settings.mcp.title")}
      </h1>

      <div className="text-sm text-muted-foreground">{t("settings.mcp.comingSoon")}</div>
    </div>
  );
};
