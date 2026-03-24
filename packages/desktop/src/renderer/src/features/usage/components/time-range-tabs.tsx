import { useTranslation } from "react-i18next";

import type { TimeRange } from "../store";

import { cn } from "../../../lib/utils";

interface TimeRangeTabsProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

const ranges: TimeRange[] = ["today", "week", "month"];

export function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  const { t } = useTranslation();

  const labels: Record<TimeRange, string> = {
    today: t("usage.today"),
    week: t("usage.week"),
    month: t("usage.month"),
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            value === range
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[range]}
        </button>
      ))}
    </div>
  );
}
