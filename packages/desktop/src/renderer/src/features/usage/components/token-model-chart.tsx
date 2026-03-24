import ReactECharts from "echarts-for-react";
import { Zap } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { TokenStats } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface TokenModelChartProps {
  data: TokenStats[];
}

function formatNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export function TokenModelChart({ data }: TokenModelChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    const models = data.map((d) => d.displayName || d.model);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (
          params: { name: string; seriesName: string; value: number; color: string }[],
        ) => {
          const model = params[0]?.name ?? "";
          const lines = params.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: ${p.value.toLocaleString()}`,
          );
          return `<b>${model}</b><br/>${lines.join("<br/>")}`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11 },
        itemWidth: 12,
        itemHeight: 12,
      },
      grid: { top: 10, right: 20, bottom: 50, left: 80 },
      yAxis: {
        type: "category",
        ["data"]: models,
        axisLine: { show: false },
        axisTick: { show: false },
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
        axisLabel: { formatter: formatNumber },
      },
      series: [
        {
          name: t("usage.input"),
          type: "bar",
          stack: "tokens",
          ["data"]: data.map((d) => d.input),
          itemStyle: { color: CHART_COLORS.chart1 },
          barMaxWidth: 24,
        },
        {
          name: t("usage.output"),
          type: "bar",
          stack: "tokens",
          ["data"]: data.map((d) => d.output),
          itemStyle: { color: CHART_COLORS.chart2 },
          barMaxWidth: 24,
        },
        {
          name: t("usage.cacheRead"),
          type: "bar",
          stack: "tokens",
          ["data"]: data.map((d) => d.cacheRead),
          itemStyle: { color: CHART_COLORS.chart3 },
          barMaxWidth: 24,
        },
        {
          name: t("usage.cacheCreate"),
          type: "bar",
          stack: "tokens",
          data: data.map((d) => d.cacheCreation),
          itemStyle: { color: CHART_COLORS.chart4, borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 24,
        },
      ],
    };
  }, [data, t]);

  if (data.length === 0) {
    return <EmptyChart icon={Zap} height={200} />;
  }

  const height = Math.max(160, data.length * 48 + 60);

  return <ReactECharts option={option} style={{ height }} />;
}
