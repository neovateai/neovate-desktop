import { ChartColumnBig, CircleDollarSign, Cpu, Database, Zap } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/utils";
import { ActivityHeatmap } from "./components/activity-heatmap";
import { CostTrendChart } from "./components/cost-trend-chart";
import { TimeRangeTabs } from "./components/time-range-tabs";
import { useStatsStore } from "./store";

export default function StatsView() {
  const { t } = useTranslation();
  const timeRange = useStatsStore((s) => s.timeRange);
  const summary = useStatsStore((s) => s.summary);
  const costTrend = useStatsStore((s) => s.costTrend);
  const activityHeatmap = useStatsStore((s) => s.activityHeatmap);
  const isLoading = useStatsStore((s) => s.isLoading);
  const setTimeRange = useStatsStore((s) => s.setTimeRange);
  const fetchAll = useStatsStore((s) => s.fetchAll);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const formatCurrency = (usd: number): string => {
    if (usd >= 100) return `$${usd.toFixed(0)}`;
    if (usd >= 10) return `$${usd.toFixed(1)}`;
    return `$${usd.toFixed(2)}`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

  if (isLoading && !summary) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">{t("stats.loading")}</span>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: t("stats.totalCost"),
      value: formatCurrency(summary?.totalCostUsd ?? 0),
      subtitle: t("stats.totalCost.description"),
      icon: CircleDollarSign,
      change: summary?.costChangePercent,
    },
    {
      label: t("stats.totalTokens"),
      value: formatNumber(summary?.totalTokens ?? 0),
      subtitle: `${formatNumber(summary?.inputTokens ?? 0)} ${t("stats.input")} · ${formatNumber(summary?.outputTokens ?? 0)} ${t("stats.output")}`,
      icon: Cpu,
    },
    {
      label: t("stats.cacheHitRate"),
      value: formatPercent(summary?.cacheHitRate ?? 0),
      subtitle: `${formatNumber(summary?.cacheTokens ?? 0)} ${t("stats.cached")}`,
      icon: Database,
    },
    {
      label: t("stats.requests"),
      value: String(summary?.requestCount ?? 0),
      subtitle: `${summary?.sessionCount ?? 0} ${t("stats.sessions")}`,
      icon: Zap,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-3 text-foreground">
          <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
            <ChartColumnBig className="size-5 text-primary" />
          </span>
          {t("stats.title")}
        </h1>
        <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric, i) => (
          <MetricCard key={i} {...metric} />
        ))}
      </div>

      {/* Cost Trend */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("stats.costTrend")}</h2>
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <div className="h-44">
            <CostTrendChart data={costTrend} />
          </div>
        </div>
      </section>

      {/* Activity Heatmap */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("stats.activity")}</h2>
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <ActivityHeatmap data={activityHeatmap} />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  change,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: typeof CircleDollarSign;
  change?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/30 p-4 transition-colors hover:bg-card/50">
      {/* Background decoration */}
      <div className="absolute -right-4 -top-4 size-24 rounded-full bg-primary/[0.03] transition-transform group-hover:scale-110" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground/50" />
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
          {change != null && change !== 0 && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                change > 0 ? "text-rose-500" : "text-emerald-500",
              )}
            >
              {change > 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Subtitle */}
        <p className="mt-1 text-xs text-muted-foreground/70 truncate">{subtitle}</p>
      </div>
    </div>
  );
}
