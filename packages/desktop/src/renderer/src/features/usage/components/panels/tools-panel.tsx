import { Loader2, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUsageData } from "../../hooks";
import { useUsageStore } from "../../store";
import { CodeEditDecisions } from "../code-edit-decisions";
import { TimeRangeTabs } from "../time-range-tabs";
import { ToolDurationChart } from "../tool-duration-chart";
import { ToolFrequencyChart } from "../tool-frequency-chart";
import { ToolSuccessRate } from "../tool-success-rate";
import { ToolTimelineChart } from "../tool-timeline-chart";
import { UsageFilters } from "../usage-filters";
import { UsageGroup } from "../usage-group";

export function ToolsPanel() {
  const { t } = useTranslation();
  const timeRange = useUsageStore((s) => s.timeRange);
  const setTimeRange = useUsageStore((s) => s.setTimeRange);

  const { data, isLoading, error } = useUsageData(timeRange);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("usage.errorLoading")}
      </div>
    );
  }

  const { toolFrequency, toolDuration, codeEditDecisions, toolTimeline } = data;

  return (
    <div className="space-y-6">
      {/* Header with time range tabs */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-xl font-semibold text-foreground">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <Wrench className="size-5 text-primary" />
          </span>
          {t("usage.tools")}
        </h1>
        <div className="flex items-center gap-3">
          <UsageFilters />
          <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Tool Frequency (Top 10) */}
      <UsageGroup title={t("usage.toolFrequency")} description={t("usage.toolFrequencyDesc")}>
        <ToolFrequencyChart data={toolFrequency} />
      </UsageGroup>

      {/* Row: Success Rate & Duration */}
      <div className="grid gap-4 md:grid-cols-2">
        <UsageGroup title={t("usage.successRate")}>
          <ToolSuccessRate data={toolFrequency} />
        </UsageGroup>
        <UsageGroup title={t("usage.avgDuration")}>
          <ToolDurationChart data={toolDuration} />
        </UsageGroup>
      </div>

      {/* Code Edit Decisions */}
      <UsageGroup
        title={t("usage.codeEditDecisions")}
        description={t("usage.codeEditDecisionsDesc")}
      >
        <CodeEditDecisions data={codeEditDecisions} />
      </UsageGroup>

      {/* Tool Timeline */}
      <UsageGroup title={t("usage.toolTimeline")} description={t("usage.toolTimelineDesc")}>
        <ToolTimelineChart data={toolTimeline} timeRange={timeRange} />
      </UsageGroup>
    </div>
  );
}
