import type { LucideIcon } from "lucide-react";

import { useTranslation } from "react-i18next";

interface EmptyChartProps {
  icon: LucideIcon;
  height?: number;
}

export function EmptyChart({ icon: Icon, height = 200 }: EmptyChartProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col items-center justify-center text-muted-foreground"
      style={{ height }}
    >
      <Icon className="mb-2 size-8 opacity-30" />
      <span className="text-sm">{t("usage.noData")}</span>
    </div>
  );
}
