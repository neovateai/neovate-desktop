import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type {
  ActivityDay,
  CostDataPoint,
  ModelStats,
  SummaryStats,
  TimeRange,
} from "../../../../shared/features/stats/types";

import { client } from "../../orpc";

type StatsState = {
  showStats: boolean;
  timeRange: TimeRange;
  summary: SummaryStats | null;
  costTrend: CostDataPoint[];
  modelBreakdown: ModelStats[];
  activityHeatmap: ActivityDay[];
  isLoading: boolean;
  error: string | null;

  setShowStats: (show: boolean) => void;
  setTimeRange: (range: TimeRange) => void;
  fetchAll: () => Promise<void>;
  fetchSummary: () => Promise<void>;
  fetchCostTrend: () => Promise<void>;
  fetchModelBreakdown: () => Promise<void>;
  fetchActivityHeatmap: () => Promise<void>;
};

export const useStatsStore = create<StatsState>()(
  immer((set, get) => ({
    showStats: false,
    timeRange: "week",
    summary: null,
    costTrend: [],
    modelBreakdown: [],
    activityHeatmap: [],
    isLoading: false,
    error: null,

    setShowStats: (show) => set({ showStats: show }),

    setTimeRange: (range) => {
      set((state) => {
        state.timeRange = range;
      });
      // Refetch data with new range
      get().fetchAll();
    },

    fetchAll: async () => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        await Promise.all([
          get().fetchSummary(),
          get().fetchCostTrend(),
          get().fetchModelBreakdown(),
          get().fetchActivityHeatmap(),
        ]);
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : "Failed to fetch stats";
        });
      } finally {
        set((state) => {
          state.isLoading = false;
        });
      }
    },

    fetchSummary: async () => {
      const { timeRange } = get();
      const summary = await client.stats.getSummary({ range: timeRange });
      set((state) => {
        state.summary = summary;
      });
    },

    fetchCostTrend: async () => {
      const { timeRange } = get();
      const costTrend = await client.stats.getCostTrend({ range: timeRange });
      set((state) => {
        state.costTrend = costTrend;
      });
    },

    fetchModelBreakdown: async () => {
      const { timeRange } = get();
      const modelBreakdown = await client.stats.getModelBreakdown({ range: timeRange });
      set((state) => {
        state.modelBreakdown = modelBreakdown;
      });
    },

    fetchActivityHeatmap: async () => {
      const activityHeatmap = await client.stats.getActivityHeatmap({ days: 365 });
      set((state) => {
        state.activityHeatmap = activityHeatmap;
      });
    },
  })),
);
