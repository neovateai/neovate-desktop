import ReactECharts from "echarts-for-react";
import { DollarSign } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ModelCostData } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface CostChartProps {
  ["data"]: ModelCostData[];
}

export function CostChart({ data }: CostChartProps) {
  const { t } = useTranslation();

  const { dates, models, seriesData, totalCost } = useMemo(() => {
    const dateSet = new Set<string>();
    const modelSet = new Set<string>();
    const map = new Map<string, Map<string, number>>();
    let total = 0;

    for (const item of data) {
      dateSet.add(item.date);
      modelSet.add(item.displayName);
      total += item.cost;

      if (!map.has(item.displayName)) {
        map.set(item.displayName, new Map());
      }
      map.get(item.displayName)!.set(item.date, item.cost);
    }

    const datesArr = Array.from(dateSet).sort();
    const modelsArr = Array.from(modelSet);

    // Build series data for each model
    const series = modelsArr.map((model) => {
      return datesArr.map((date) => map.get(model)?.get(date) ?? 0);
    });

    return {
      dates: datesArr,
      models: modelsArr,
      seriesData: series,
      totalCost: total,
    };
  }, [data]);

  const option = useMemo(() => {
    const colors = [
      CHART_COLORS.chart1,
      CHART_COLORS.chart2,
      CHART_COLORS.chart3,
      CHART_COLORS.chart4,
      CHART_COLORS.chart5,
    ];

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (
          params: { name: string; seriesName: string; value: number; color: string }[],
        ) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const date = params[0]?.name ?? "";
          const lines = params.map(
            (p) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: $${p.value.toFixed(2)}`,
          );
          return `<div style="font-weight:600;margin-bottom:4px">${date}</div>${lines.join("<br/>")}`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11 },
        itemWidth: 12,
        itemHeight: 12,
      },
      grid: { top: 10, right: 10, bottom: 50, left: 50 },
      xAxis: {
        type: "category",
        ["data"]: dates.map((d) => d.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_COLORS.border, opacity: 0.5 } },
        axisLabel: { formatter: "${value}" },
      },
      series: models.map((model, index) => ({
        name: model,
        type: "bar",
        stack: "cost",
        ["data"]: seriesData[index],
        itemStyle: {
          color: colors[index % colors.length],
          borderRadius: index === models.length - 1 ? [4, 4, 0, 0] : undefined,
        },
        barMaxWidth: 32,
      })),
    };
  }, [dates, models, seriesData]);

  if (dates.length === 0) {
    return <EmptyChart icon={DollarSign} height={220} />;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <span className="text-sm text-muted-foreground">
          {t("usage.total")}: ${totalCost.toFixed(2)}
        </span>
      </div>
      <ReactECharts option={option} style={{ height: 220 }} />
    </div>
  );
}
