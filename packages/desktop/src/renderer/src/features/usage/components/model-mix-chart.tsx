import ReactECharts from "echarts-for-react";
import { PieChart } from "lucide-react";
import { useMemo } from "react";

import type { ModelMixData } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ModelMixChartProps {
  data: ModelMixData[];
}

const COLORS = [
  CHART_COLORS.chart1,
  CHART_COLORS.chart2,
  CHART_COLORS.chart3,
  CHART_COLORS.chart4,
  CHART_COLORS.chart5,
];

export function ModelMixChart({ data }: ModelMixChartProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: (params: { name: string; value: number; percent: number; color: string }) => {
          return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${params.color};margin-right:6px;"></span>${params.name}<br/><b>$${params.value.toFixed(2)}</b> · ${params.percent}%`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          ["data"]: data.map((d, i) => ({
            name: d.displayName,
            value: d.cost,
            itemStyle: { color: COLORS[i % COLORS.length] },
          })),
          label: { show: false },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.2)",
            },
          },
        },
      ],
    }),
    [data],
  );

  if (data.length === 0) {
    return <EmptyChart icon={PieChart} height={300} />;
  }

  return (
    <div>
      <ReactECharts option={option} style={{ height: 220 }} />
      <div className="mt-4 space-y-2">
        {data.map((d, i) => (
          <div key={d.model} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span>{d.displayName}</span>
            </div>
            <div className="flex gap-4 text-muted-foreground">
              <span>${d.cost.toFixed(2)}</span>
              <span>{d.requests} reqs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
