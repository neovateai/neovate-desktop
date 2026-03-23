import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { TimeRange } from "../../../../shared/features/usage";

export type { TimeRange };

export type UsageMenuId = "overview" | "tools" | "analytics" | "wrapped";

// "all" means no filter applied
export type ProviderFilter = string | "all";
export type ModelFilter = string | "all";

interface UsageUIState {
  showUsage: boolean;
  activeTab: UsageMenuId;
  timeRange: TimeRange;
  providerFilter: ProviderFilter;
  modelFilter: ModelFilter;
}

interface UsageUIActions {
  setShowUsage: (show: boolean) => void;
  setActiveTab: (tab: UsageMenuId) => void;
  setTimeRange: (range: TimeRange) => void;
  setProviderFilter: (provider: ProviderFilter) => void;
  setModelFilter: (model: ModelFilter) => void;
}

export const useUsageStore = create<UsageUIState & UsageUIActions>()(
  immer((set) => ({
    showUsage: false,
    activeTab: "overview",
    timeRange: "week",
    providerFilter: "all",
    modelFilter: "all",
    setShowUsage: (show) =>
      set((state) => {
        state.showUsage = show;
      }),
    setActiveTab: (tab) =>
      set((state) => {
        state.activeTab = tab;
      }),
    setTimeRange: (range) =>
      set((state) => {
        state.timeRange = range;
      }),
    setProviderFilter: (provider) =>
      set((state) => {
        state.providerFilter = provider;
        // Reset model filter when provider changes
        state.modelFilter = "all";
      }),
    setModelFilter: (model) =>
      set((state) => {
        state.modelFilter = model;
      }),
  })),
);
