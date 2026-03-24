import { TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "../../../../components/ui/spinner";
import { useUsageData } from "../../hooks";
import { useUsageStore } from "../../store";
import { CacheHitTrend } from "../cache-hit-trend";
import { CostEfficiencyTrend } from "../cost-efficiency-trend";
import { ErrorRateCard } from "../error-rate-card";
import { ModelMixChart } from "../model-mix-chart";
import { PeakHoursChart } from "../peak-hours-chart";
import { SessionLengthChart } from "../session-length-chart";
import { TimeRangeTabs } from "../time-range-tabs";
import { TokenModelChart } from "../token-model-chart";
import { UsageFilters } from "../usage-filters";
import { UsageGroup } from "../usage-group";

export function AnalyticsPanel() {
  const { t } = useTranslation();
  const timeRange = useUsageStore((s) => s.timeRange);
  const setTimeRange = useUsageStore((s) => s.setTimeRange);

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

  const {
    hourlyActivity,
    sessionBuckets,
    errorRate: errorRateStats,
    cacheHitTrend,
    tokenStats,
    costEfficiencyTrend,
    modelMix,
  } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-xl font-semibold text-foreground">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <TrendingUp className="size-5 text-primary" />
          </span>
          {t("usage.analytics")}
        </h1>
        <div className="flex items-center gap-3">
          <UsageFilters />
          <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      <div className="space-y-5">
        {/* Cache & Cost Efficiency */}
        <div className="grid gap-5 md:grid-cols-2">
          <UsageGroup title={t("usage.cacheHitRate")}>
            <CacheHitTrend data={cacheHitTrend} />
          </UsageGroup>
          <UsageGroup title={t("usage.costEfficiency")}>
            <CostEfficiencyTrend data={costEfficiencyTrend} />
          </UsageGroup>
        </div>

        {/* Peak Hours & Error Rate */}
        <div className="grid gap-5 md:grid-cols-2">
          <UsageGroup title={t("usage.peakHours")}>
            <PeakHoursChart data={hourlyActivity} />
          </UsageGroup>
          <UsageGroup title={t("usage.errorRate")}>
            <ErrorRateCard data={errorRateStats} />
          </UsageGroup>
        </div>

        {/* Session Length & Model Mix */}
        <div className="grid gap-5 md:grid-cols-2">
          <UsageGroup title={t("usage.sessionLengthDistribution")}>
            <SessionLengthChart data={sessionBuckets} />
          </UsageGroup>
          <UsageGroup title={t("usage.modelMix")}>
            <ModelMixChart data={modelMix} />
          </UsageGroup>
        </div>

        {/* Token Usage */}
        <UsageGroup title={t("usage.tokenUsageByModel")}>
          <TokenModelChart data={tokenStats} />
        </UsageGroup>
      </div>
    </div>
  );
}
