import ReactECharts from "echarts-for-react";
import { Database } from "lucide-react";
import { useMemo } from "react";

import type { CacheHitTrend as CacheHitTrendData } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface CacheHitTrendProps {
  data: CacheHitTrendData[];
}

export function CacheHitTrend({ data }: CacheHitTrendProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        formatter: (params: { name: string; value: number }[]) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const item = params[0];
          return `<div style="font-weight:600;margin-bottom:4px">${item.name}</div>${item.value.toFixed(1)}%`;
        },
      },
      grid: { top: 10, right: 10, bottom: 30, left: 50 },
      xAxis: {
        type: "category",
        ["data"]: data.map((d) => d.date.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
        axisLabel: { formatter: "{value}%" },
      },
      series: [
        {
          type: "line",
          ["data"]: data.map((d) => d.rate),
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color: CHART_COLORS.chart3, width: 2 },
          itemStyle: { color: CHART_COLORS.chart3 },
          areaStyle: { color: CHART_COLORS.chart3, opacity: 0.1 },
        },
      ],
    }),
    [data],
  );

  if (data.length === 0) {
    return <EmptyChart icon={Database} height={200} />;
  }

  return <ReactECharts option={option} style={{ height: 200 }} />;
}
