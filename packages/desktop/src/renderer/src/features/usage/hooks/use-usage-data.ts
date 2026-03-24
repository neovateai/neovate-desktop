import { useCallback, useEffect, useState } from "react";

import type { TimeRange } from "../../../../../shared/features/usage";
import type { UsageData } from "../../../../../shared/features/usage/types";

import { useUsageStore } from "../store";

// TODO: Replace with real API call when backend is ready
// import { client } from "../../../orpc";

interface UseUsageDataResult {
  ["data"]: UsageData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Returns empty data structure for all usage data fields.
 * This is used as placeholder until backend is connected.
 */
function getEmptyUsageData(): UsageData {
  return {
    summary: {
      totalCost: 0,
      totalTokens: 0,
      cacheTokens: 0,
      cachePercentage: 0,
      totalSessions: 0,
      todaySessions: 0,
      linesOfCodeAdded: 0,
      linesOfCodeRemoved: 0,
      costChangePercent: 0,
    },
    costTrend: [],
    activityHeatmap: [],
    hourlyActivity: [],
    sessionBuckets: [],
    errorRate: {
      totalRequests: 0,
      totalErrors: 0,
      errorRate: 0,
    },
    cacheHitTrend: [],
    tokenStats: [],
    costEfficiencyTrend: [],
    modelMix: [],
    toolFrequency: [],
    toolDuration: [],
    codeEditDecisions: [],
    toolTimeline: {
      dates: [],
      series: [],
    },
    wrapped: null,
  };
}

export function useUsageData(timeRange: TimeRange): UseUsageDataResult {
  const [data, setData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Get filter values from store
  const providerFilter = useUsageStore((s) => s.providerFilter);
  const modelFilter = useUsageStore((s) => s.modelFilter);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with real API call when backend is ready
      // const result = await client.usage.getData({
      //   timeRange,
      //   provider: providerFilter === "all" ? undefined : providerFilter,
      //   model: modelFilter === "all" ? undefined : modelFilter,
      // });
      // setData(result);

      // Return empty data until backend is connected
      // Simulate brief loading state
      await new Promise((resolve) => setTimeout(resolve, 50));
      setData(getEmptyUsageData());
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch usage data"));
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, providerFilter, modelFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}
