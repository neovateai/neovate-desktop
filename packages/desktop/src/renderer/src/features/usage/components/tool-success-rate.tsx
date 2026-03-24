import ReactECharts from "echarts-for-react";
import { CheckCircle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ToolFrequency } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ToolSuccessRateProps {
  data: ToolFrequency[];
}

export function ToolSuccessRate({ data }: ToolSuccessRateProps) {
  const { t } = useTranslation();

  // Filter to tools with some failures and sort by failure count
  const toolsWithStats = useMemo(() => {
    return [...data]
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [data]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      legend: {
        data: [t("usage.success"), t("usage.failure")],
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { top: 10, right: 20, bottom: 30, left: 0, containLabel: true },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
      },
      yAxis: {
        type: "category",
        ["data"]: toolsWithStats.map((d) => d.toolName),
        axisLine: { show: false },
        axisTick: { show: false },
        inverse: true,
      },
      series: [
        {
          name: t("usage.success"),
          type: "bar",
          stack: "total",
          ["data"]: toolsWithStats.map((d) => d.successes),
          itemStyle: { color: CHART_COLORS.chart1 },
          barMaxWidth: 20,
        },
        {
          name: t("usage.failure"),
          type: "bar",
          stack: "total",
          ["data"]: toolsWithStats.map((d) => d.failures),
          itemStyle: { color: CHART_COLORS.chart5 },
          barMaxWidth: 20,
        },
      ],
    }),
    [toolsWithStats, t],
  );

  if (data.length === 0) {
    return <EmptyChart icon={CheckCircle} height={200} />;
  }

  const height = Math.max(200, toolsWithStats.length * 32 + 50);

  return <ReactECharts option={option} style={{ height }} />;
}
