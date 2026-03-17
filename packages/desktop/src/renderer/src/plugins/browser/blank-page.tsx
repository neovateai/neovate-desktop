import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

export function BlankPage() {
  const { t } = useTranslation("plugin-browser");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Globe className="size-12 opacity-20" />
      <p className="text-sm font-medium">{t("blank.title")}</p>
      <p className="text-xs opacity-60">{t("blank.hint")}</p>
    </div>
  );
}
