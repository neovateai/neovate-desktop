import ReactECharts from "echarts-for-react";
import { Activity } from "lucide-react";
import { useMemo } from "react";

import type { TimeRange } from "../store";
import type { ToolTimelineData } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ToolTimelineChartProps {
  data: ToolTimelineData;
  timeRange: TimeRange;
}

const COLORS = [
  CHART_COLORS.chart1,
  CHART_COLORS.chart2,
  CHART_COLORS.chart3,
  CHART_COLORS.chart4,
  CHART_COLORS.chart5,
];

export function ToolTimelineChart({ data, timeRange }: ToolTimelineChartProps) {
  const option = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      legend: {
        data: data.series.map((s) => s.name),
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { top: 10, right: 10, bottom: 30, left: 0, containLabel: true },
      xAxis: {
        type: "category",
        ["data"]: data.dates.map((d) => (timeRange === "today" ? d : d.slice(5))),
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
      },
      series: data.series.map((s, i) => ({
        name: s.name,
        type: "line",
        ["data"]: s.data,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: COLORS[i % COLORS.length] },
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    }),
    [data, timeRange],
  );

  if (data.series.length === 0) {
    return <EmptyChart icon={Activity} height={250} />;
  }

  return <ReactECharts option={option} style={{ height: 250 }} />;
}
