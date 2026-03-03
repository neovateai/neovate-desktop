import { useTranslation } from "react-i18next";
import { useRendererApp } from "../../core/app";
import { locales, normalizeLocale } from "../../core/i18n";
import { Button } from "./button";

export function LanguageToggle({ className }: { className?: string }) {
  const { i18nManager } = useRendererApp();
  const { i18n, t } = useTranslation();

  const current = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const next = locales.find((l) => l !== current) ?? locales[0];

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("language.toggle")}
      className={className}
      onClick={() => i18nManager.applyUILocale(next)}
    >
      <span className="text-[10px] font-medium leading-none">
        {current === "zh-CN" ? "EN" : "中"}
      </span>
    </Button>
  );
}
