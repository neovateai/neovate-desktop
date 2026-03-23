import ReactECharts from "echarts-for-react";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";

import type { ToolFrequency } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ToolFrequencyChartProps {
  data: ToolFrequency[];
}

export function ToolFrequencyChart({ data }: ToolFrequencyChartProps) {
  const sortedTop10 = useMemo(() => {
    return [...data].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [data]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: { name: string; value: number }[]) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const toolName = params[0].name;
          const item = sortedTop10.find((d) => d.toolName === toolName);
          if (!item) return toolName;
          const rate = item.count > 0 ? ((item.successes / item.count) * 100).toFixed(1) : "0";
          return `${item.toolName}<br/>Uses: ${item.count}<br/>Success: ${rate}%`;
        },
      },
      grid: { top: 10, right: 20, bottom: 0, left: 0, containLabel: true },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
      },
      yAxis: {
        type: "category",
        ["data"]: sortedTop10.map((d) => d.toolName),
        axisLine: { show: false },
        axisTick: { show: false },
        inverse: true,
      },
      series: [
        {
          name: "Uses",
          type: "bar",
          ["data"]: sortedTop10.map((d) => d.count),
          barMaxWidth: 20,
          itemStyle: {
            color: CHART_COLORS.chart1,
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    }),
    [sortedTop10],
  );

  if (data.length === 0) {
    return <EmptyChart icon={BarChart3} height={220} />;
  }

  const height = Math.max(220, sortedTop10.length * 32 + 40);

  return <ReactECharts option={option} style={{ height }} />;
}
