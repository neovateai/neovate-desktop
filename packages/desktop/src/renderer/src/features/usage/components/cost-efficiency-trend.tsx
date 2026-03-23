import ReactECharts from "echarts-for-react";
import { TrendingDown } from "lucide-react";
import { useMemo } from "react";

import type { CostEfficiencyPoint } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface CostEfficiencyTrendProps {
  data: CostEfficiencyPoint[];
}

export function CostEfficiencyTrend({ data }: CostEfficiencyTrendProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        formatter: (params: { name: string; value: number; dataIndex: number }[]) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const item = params[0];
          const point = data[item.dataIndex];
          return `<div style="font-weight:600;margin-bottom:4px">${item.name}</div>$${item.value.toFixed(3)}/session<br/>${point?.sessionCount ?? 0} sessions`;
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
        name: "$/session",
        nameLocation: "end",
        nameTextStyle: { fontSize: 11, padding: [0, 0, 0, 4] },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
        axisLabel: { formatter: (v: number) => `$${v.toFixed(2)}` },
      },
      series: [
        {
          type: "line",
          ["data"]: data.map((d) => d.costPerSession),
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color: CHART_COLORS.chart1, width: 2 },
          itemStyle: { color: CHART_COLORS.chart1 },
          areaStyle: { color: CHART_COLORS.chart1, opacity: 0.1 },
        },
      ],
    }),
    [data],
  );

  if (data.length === 0) {
    return <EmptyChart icon={TrendingDown} height={200} />;
  }

  return <ReactECharts option={option} style={{ height: 200 }} />;
}
