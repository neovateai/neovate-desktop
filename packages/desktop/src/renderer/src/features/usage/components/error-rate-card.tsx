import ReactECharts from "echarts-for-react";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ErrorRateStats } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface ErrorRateCardProps {
  ["data"]: ErrorRateStats;
}

export function ErrorRateCard({ data }: ErrorRateCardProps) {
  const { t } = useTranslation();

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
      },
      series: [
        {
          type: "pie",
          radius: ["55%", "75%"],
          avoidLabelOverlap: false,
          label: { show: false },
          ["data"]: [
            {
              name: t("usage.errors"),
              value: data.totalErrors,
              itemStyle: { color: CHART_COLORS.error },
            },
            {
              name: t("usage.successfulRequests"),
              value: Math.max(0, data.totalRequests - data.totalErrors),
              itemStyle: { color: CHART_COLORS.success },
            },
          ],
        },
      ],
    }),
    [data, t],
  );

  // Show empty state if no requests
  if (data.totalRequests === 0) {
    return <EmptyChart icon={AlertCircle} height={200} />;
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-sm text-muted-foreground">
          {(data.errorRate * 100).toFixed(2)}% ({data.totalErrors}/{data.totalRequests})
        </p>
      </div>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}
