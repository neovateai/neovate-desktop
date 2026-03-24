import ReactECharts from "echarts-for-react";
import { FileEdit } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { CodeEditDecision } from "../types";

import { CHART_COLORS } from "./chart-colors";
import { EmptyChart } from "./empty-chart";

interface CodeEditDecisionsProps {
  data: CodeEditDecision[];
}

export function CodeEditDecisions({ data }: CodeEditDecisionsProps) {
  const { t } = useTranslation();

  const { totalAccepts, totalRejects } = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        totalAccepts: acc.totalAccepts + d.accepts,
        totalRejects: acc.totalRejects + d.rejects,
      }),
      { totalAccepts: 0, totalRejects: 0 },
    );
  }, [data]);

  const donutOption = useMemo(
    () => ({
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["50%", "75%"],
          ["data"]: [
            {
              name: t("usage.accept"),
              value: totalAccepts,
              itemStyle: { color: CHART_COLORS.chart1 },
            },
            {
              name: t("usage.reject"),
              value: totalRejects,
              itemStyle: { color: CHART_COLORS.chart5 },
            },
          ],
          label: { show: false },
        },
      ],
    }),
    [totalAccepts, totalRejects, t],
  );

  if (totalAccepts + totalRejects === 0) {
    return <EmptyChart icon={FileEdit} height={200} />;
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-sm text-muted-foreground">
          {totalAccepts} {t("usage.accepted")} / {totalRejects} {t("usage.rejected")}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ReactECharts option={donutOption} style={{ height: 200 }} />
        <div className="max-h-[200px] space-y-2 overflow-y-auto">
          <p className="sticky top-0 bg-transparent pb-1 text-sm font-medium text-muted-foreground">
            {t("usage.byLanguage")}
          </p>
          {data.slice(0, 10).map((d) => {
            const total = d.accepts + d.rejects;
            const rate = total > 0 ? ((d.accepts / total) * 100).toFixed(0) : "0";
            return (
              <div key={d.language} className="flex items-center justify-between text-sm">
                <span>{d.language}</span>
                <div className="flex gap-3 text-muted-foreground">
                  <span className="text-green-500">{d.accepts}</span>
                  <span className="text-red-500">{d.rejects}</span>
                  <span className="w-12 text-right">{rate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
