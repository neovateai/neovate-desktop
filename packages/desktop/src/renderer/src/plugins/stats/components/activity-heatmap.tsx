import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ActivityDay } from "../../../../../shared/features/stats/types";

import { cn } from "../../../lib/utils";

type ActivityHeatmapProps = {
  data: ActivityDay[];
  days?: number;
};

const CELL_SIZE = 10;
const CELL_GAP = 3;
const DAY_LABEL_WIDTH = 28;
const MONTH_LABEL_HEIGHT = 16;

const MONTH_KEYS = [
  "stats.month.jan",
  "stats.month.feb",
  "stats.month.mar",
  "stats.month.apr",
  "stats.month.may",
  "stats.month.jun",
  "stats.month.jul",
  "stats.month.aug",
  "stats.month.sep",
  "stats.month.oct",
  "stats.month.nov",
  "stats.month.dec",
] as const;

export function ActivityHeatmap({ data, days = 365 }: ActivityHeatmapProps) {
  const { t } = useTranslation();

  const { grid, maxCount, months } = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const day of data) {
      countMap.set(day.date, day.count);
    }

    const today = new Date();
    const grid: { date: string; count: number; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];
    let maxCount = 0;

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const monthLabels: { monthIndex: number; weekIndex: number }[] = [];
    let lastMonth = -1;

    for (let i = 0; i <= days + 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);

      if (d > today) break;

      const dateStr = d.toISOString().split("T")[0]!;
      const dayOfWeek = d.getDay();
      const count = countMap.get(dateStr) ?? 0;
      maxCount = Math.max(maxCount, count);

      const month = d.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ monthIndex: month, weekIndex: grid.length });
        lastMonth = month;
      }

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        grid.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({ date: dateStr, count, dayOfWeek });
    }

    if (currentWeek.length > 0) {
      grid.push(currentWeek);
    }

    return { grid, maxCount, months: monthLabels };
  }, [data, days]);

  const getLevel = (count: number): number => {
    if (count === 0 || maxCount === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const width = grid.length * (CELL_SIZE + CELL_GAP) + DAY_LABEL_WIDTH + 4;
  const height = 7 * (CELL_SIZE + CELL_GAP) + MONTH_LABEL_HEIGHT + 4;

  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-sm text-muted-foreground/60">{t("stats.noData")}</p>
      </div>
    );
  }

  // Day labels with their row index
  const dayLabels = [
    { key: "stats.day.mon", row: 1 },
    { key: "stats.day.wed", row: 3 },
    { key: "stats.day.fri", row: 5 },
  ] as const;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block">
        {/* Month labels */}
        {months.map((m, i) => (
          <text
            key={`month-${i}`}
            x={DAY_LABEL_WIDTH + m.weekIndex * (CELL_SIZE + CELL_GAP)}
            y={11}
            className="fill-muted-foreground/60 text-[10px] font-medium"
          >
            {t(MONTH_KEYS[m.monthIndex])}
          </text>
        ))}

        {/* Day labels */}
        {dayLabels.map(({ key, row }) => (
          <text
            key={key}
            x={0}
            y={MONTH_LABEL_HEIGHT + row * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 1}
            className="fill-muted-foreground/50 text-[10px]"
          >
            {t(key)}
          </text>
        ))}

        {/* Grid cells */}
        {grid.map((week, weekIndex) =>
          week.map((day) => (
            <rect
              key={day.date}
              x={DAY_LABEL_WIDTH + weekIndex * (CELL_SIZE + CELL_GAP)}
              y={MONTH_LABEL_HEIGHT + day.dayOfWeek * (CELL_SIZE + CELL_GAP)}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              className={cn("transition-all duration-150", getLevelClass(getLevel(day.count)))}
            >
              <title>
                {day.date}: {day.count} {day.count === 1 ? "request" : "requests"}
              </title>
            </rect>
          )),
        )}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground/60">
        <span>{t("stats.less")}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn("size-[10px] rounded-sm transition-colors", getLegendClass(level))}
          />
        ))}
        <span>{t("stats.more")}</span>
      </div>
    </div>
  );
}

function getLevelClass(level: number): string {
  switch (level) {
    case 0:
      return "fill-muted-foreground/10 dark:fill-muted-foreground/5";
    case 1:
      return "fill-primary/20";
    case 2:
      return "fill-primary/40";
    case 3:
      return "fill-primary/60";
    case 4:
      return "fill-primary";
    default:
      return "fill-muted-foreground/10";
  }
}

// For div elements (legend), use bg-* instead of fill-*
function getLegendClass(level: number): string {
  switch (level) {
    case 0:
      return "bg-muted-foreground/10 dark:bg-muted-foreground/5";
    case 1:
      return "bg-primary/20";
    case 2:
      return "bg-primary/40";
    case 3:
      return "bg-primary/60";
    case 4:
      return "bg-primary";
    default:
      return "bg-muted-foreground/10";
  }
}
