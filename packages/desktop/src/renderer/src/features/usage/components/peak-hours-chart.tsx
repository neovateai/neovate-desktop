import ReactECharts from "echarts-for-react";
import { Clock } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { HourlyActivity } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface PeakHoursChartProps {
  data: HourlyActivity[];
}

export function PeakHoursChart({ data }: PeakHoursChartProps) {
  const { t } = useTranslation();

  const { peakHour, option } = useMemo(() => {
    const peak = data.reduce((max, d) => (d.count > max.count ? d : max), data[0]);

    return {
      peakHour: peak?.hour ?? 0,
      option: {
        tooltip: {
          trigger: "axis",
          formatter: (params: { name: string; value: number }[]) => {
            if (!Array.isArray(params) || params.length === 0) return "";
            const item = params[0];
            return `<div style="font-weight:600;margin-bottom:4px">${item.name}</div>${item.value} ${t("usage.requests")}`;
          },
        },
        grid: { top: 10, right: 10, bottom: 30, left: 40 },
        xAxis: {
          type: "category",
          data: data.map((d) => `${d.hour.toString().padStart(2, "0")}:00`),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { interval: 5, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
        },
        series: [
          {
            type: "bar",
            data: data.map((d) => ({
              value: d.count,
              itemStyle: {
                color: d.hour === peak?.hour ? CHART_COLORS.chart2 : CHART_COLORS.chart1,
                borderRadius: [4, 4, 0, 0],
              },
            })),
            barMaxWidth: 16,
          },
        ],
      },
    };
  }, [data, t]);

  if (data.length === 0) {
    return <EmptyChart icon={Clock} height={200} />;
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-sm text-muted-foreground">
          {t("usage.mostActiveAt", { hour: peakHour.toString().padStart(2, "0") })}
        </p>
      </div>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}
