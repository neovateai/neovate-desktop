import ReactECharts from "echarts-for-react";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ActivityDay } from "../types";

import { HEATMAP_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ActivityHeatmapProps {
  ["data"]: ActivityDay[];
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const { t } = useTranslation();

  const { totalSessions, option } = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const maxCount = Math.max(...data.map((d) => d.count), 1);

    // Convert data to echarts heatmap format: [weekIndex, dayOfWeek, value]
    // dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
    const heatmapData: [number, number, number, string][] = [];
    const weekLabels: string[] = [];

    if (data.length > 0) {
      const firstDate = new Date(data[0].date);
      let currentWeekStart = new Date(firstDate);
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

      let weekIndex = 0;
      for (const day of data) {
        const date = new Date(day.date);
        const dayOfWeek = date.getDay();

        // Check if we moved to a new week
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - dayOfWeek);
        if (weekStart.getTime() > currentWeekStart.getTime()) {
          weekIndex++;
          currentWeekStart = weekStart;
        }

        heatmapData.push([weekIndex, dayOfWeek, day.count, day.date]);

        // Add month label for first day of each month
        if (date.getDate() <= 7 && dayOfWeek === 0) {
          weekLabels[weekIndex] = date.toLocaleDateString("en-US", { month: "short" });
        }
      }
    }

    const totalWeeks = heatmapData.length > 0 ? Math.max(...heatmapData.map((d) => d[0])) + 1 : 53;

    return {
      totalSessions: total,
      option: {
        tooltip: {
          formatter: (params: { ["data"]: [number, number, number, string] }) => {
            const [, , count, date] = params["data"];
            return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${count} sessions`;
          },
        },
        grid: {
          top: 20,
          right: 10,
          bottom: 10,
          left: 30,
        },
        xAxis: {
          type: "category",
          ["data"]: Array.from({ length: totalWeeks }, (_, i) => weekLabels[i] || ""),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            fontSize: 10,
            color: "var(--muted-foreground)",
          },
          splitLine: { show: false },
        },
        yAxis: {
          type: "category",
          ["data"]: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            fontSize: 10,
            color: "var(--muted-foreground)",
            formatter: (value: string) => value.slice(0, 1),
          },
        },
        visualMap: {
          show: false,
          min: 0,
          max: maxCount,
          inRange: {
            color: [...HEATMAP_COLORS],
          },
        },
        series: [
          {
            type: "heatmap",
            ["data"]: heatmapData,
            itemStyle: {
              borderRadius: 2,
              borderWidth: 1,
              borderColor: "var(--background)",
            },
            emphasis: {
              itemStyle: {
                borderColor: "var(--foreground)",
                borderWidth: 1,
              },
            },
          },
        ],
      },
    };
  }, [data]);

  if (data.length === 0) {
    return <EmptyChart icon={CalendarDays} height={140} />;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <span className="text-sm text-muted-foreground">
          {t("usage.totalSessions", { count: totalSessions })}
        </span>
      </div>
      <ReactECharts option={option} style={{ height: 140 }} />
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>{t("usage.less")}</span>
        <div className="flex gap-0.5">
          {HEATMAP_COLORS.map((color) => (
            <div key={color} className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
          ))}
        </div>
        <span>{t("usage.more")}</span>
      </div>
    </div>
  );
}
