import { BarChart3, Boxes, Code, DollarSign, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "../../../../components/ui/spinner";
import { useUsageData } from "../../hooks";
import { useUsageStore } from "../../store";
import { ActivityHeatmap } from "../activity-heatmap";
import { CostChart } from "../cost-chart";
import { StatCard } from "../stat-card";
import { TimeRangeTabs } from "../time-range-tabs";
import { UsageFilters } from "../usage-filters";
import { UsageGroup } from "../usage-group";

function formatNumber(num: number): { value: string; unit?: string } {
  if (num >= 1_000_000) {
    return { value: (num / 1_000_000).toFixed(1), unit: "M" };
  }
  if (num >= 1_000) {
    return { value: (num / 1_000).toFixed(1), unit: "K" };
  }
  return { value: num.toString() };
}

export function OverviewPanel() {
  const { t } = useTranslation();
  const timeRange = useUsageStore((s) => s.timeRange);
  const setTimeRange = useUsageStore((s) => s.setTimeRange);

  // Fetch usage data via hook (uses mock data, ready for backend)
  const { data, isLoading, error } = useUsageData(timeRange);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("usage.errorLoading")}
      </div>
    );
  }

  const { summary: stats, costTrend, activityHeatmap: activityData } = data;

  const tokens = formatNumber(stats.totalTokens);
  const linesChanged = formatNumber(stats.linesOfCodeAdded + stats.linesOfCodeRemoved);

  // Calculate cost projection for month view
  const getCostDescription = () => {
    const changePercent =
      stats.costChangePercent !== 0
        ? `${stats.costChangePercent >= 0 ? "+" : ""}${stats.costChangePercent.toFixed(0)}% ${t("usage.vsLast")}`
        : "";

    if (timeRange === "month") {
      const now = new Date();
      const daysPassed = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const projectedCost = daysPassed > 0 ? (stats.totalCost / daysPassed) * daysInMonth : 0;
      const projectedStr = `$${projectedCost.toFixed(2)}`;
      return changePercent
        ? `${changePercent} · ${t("usage.projected")}: ${projectedStr}`
        : `${t("usage.projected")}: ${projectedStr}`;
    }

    return changePercent || undefined;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-xl font-semibold text-foreground">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="size-5 text-primary" />
          </span>
          {t("usage.overview")}
        </h1>
        <div className="flex items-center gap-3">
          <UsageFilters />
          <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      <div className="space-y-5">
        {/* Summary Stats */}
        <UsageGroup title={t("usage.summaryStats")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t("usage.totalCost")}
              value={`$${stats.totalCost.toFixed(2)}`}
              description={getCostDescription()}
              icon={<DollarSign className="size-4" />}
              color="emerald"
            />
            <StatCard
              title={t("usage.tokens")}
              value={tokens.value}
              unit={tokens.unit}
              description={`${stats.cachePercentage.toFixed(0)}% ${t("usage.fromCache")}`}
              icon={<Zap className="size-4" />}
              color="blue"
            />
            <StatCard
              title={t("usage.linesChanged")}
              value={linesChanged.value}
              unit={linesChanged.unit}
              description={`+${formatNumber(stats.linesOfCodeAdded).value}${formatNumber(stats.linesOfCodeAdded).unit ?? ""} / -${formatNumber(stats.linesOfCodeRemoved).value}${formatNumber(stats.linesOfCodeRemoved).unit ?? ""}`}
              icon={<Code className="size-4" />}
              color="violet"
            />
            <StatCard
              title={t("usage.sessions")}
              value={stats.totalSessions.toString()}
              description={`+${stats.todaySessions} ${t("usage.todayLabel")}`}
              icon={<Boxes className="size-4" />}
              color="amber"
            />
          </div>
        </UsageGroup>

        {/* Cost Trends */}
        <UsageGroup title={t("usage.costTrends")}>
          <CostChart data={costTrend} />
        </UsageGroup>

        {/* Activity */}
        <UsageGroup title={t("usage.activityHeatmap")}>
          <ActivityHeatmap data={activityData} />
        </UsageGroup>
      </div>
    </div>
  );
}
