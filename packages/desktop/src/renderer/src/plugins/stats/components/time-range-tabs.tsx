import { useTranslation } from "react-i18next";

import type { TimeRange } from "../../../../../shared/features/stats/types";

import { cn } from "../../../lib/utils";

type TimeRangeTabsProps = {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
};

export function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      <button
        type="button"
        onClick={() => onChange("today")}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          value === "today"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("stats.today")}
      </button>
      <button
        type="button"
        onClick={() => onChange("week")}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          value === "week"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("stats.week")}
      </button>
      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          value === "month"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("stats.month")}
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          value === "year"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("stats.year")}
      </button>
    </div>
  );
}
