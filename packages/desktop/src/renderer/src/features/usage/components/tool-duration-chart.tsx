import ReactECharts from "echarts-for-react";
import { Hourglass } from "lucide-react";
import { useMemo } from "react";

import type { ToolDuration } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ToolDurationChartProps {
  data: ToolDuration[];
}

export function ToolDurationChart({ data }: ToolDurationChartProps) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.avgDurationMs - a.avgDurationMs);
  }, [data]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: { name: string; value: number }[]) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const ms = params[0].value;
          if (ms >= 1000) {
            return `${params[0].name}: ${(ms / 1000).toFixed(2)}s`;
          }
          return `${params[0].name}: ${ms}ms`;
        },
      },
      grid: { top: 10, right: 20, bottom: 0, left: 0, containLabel: true },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
        axisLabel: {
          formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}s` : `${v}ms`),
        },
      },
      yAxis: {
        type: "category",
        ["data"]: sortedData.map((d) => d.toolName),
        axisLine: { show: false },
        axisTick: { show: false },
        inverse: true,
      },
      series: [
        {
          type: "bar",
          ["data"]: sortedData.map((d) => d.avgDurationMs),
          itemStyle: {
            color: CHART_COLORS.chart3,
            borderRadius: [0, 4, 4, 0],
          },
          barMaxWidth: 20,
        },
      ],
    }),
    [sortedData],
  );

  if (data.length === 0) {
    return <EmptyChart icon={Hourglass} height={200} />;
  }

  const height = Math.max(200, sortedData.length * 32 + 40);

  return <ReactECharts option={option} style={{ height }} />;
}
