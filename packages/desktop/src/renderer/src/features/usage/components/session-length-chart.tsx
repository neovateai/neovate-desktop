import ReactECharts from "echarts-for-react";
import { Timer } from "lucide-react";
import { useMemo } from "react";

import type { SessionBucket } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface SessionLengthChartProps {
  data: SessionBucket[];
}

export function SessionLengthChart({ data }: SessionLengthChartProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      grid: { top: 10, right: 10, bottom: 30, left: 50 },
      xAxis: {
        type: "category",
        data: data.map((d) => d.bucket),
        axisLine: { show: false },
        axisTick: { show: false },
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
          data: data.map((d) => d.count),
          barMaxWidth: 40,
          itemStyle: {
            color: CHART_COLORS.chart2,
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    }),
    [data],
  );

  if (data.length === 0) {
    return <EmptyChart icon={Timer} height={200} />;
  }

  return <ReactECharts option={option} style={{ height: 200 }} />;
}
