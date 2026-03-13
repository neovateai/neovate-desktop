import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { BenchmarkResult, Provider } from "../../../../shared/features/provider/types";

import { client } from "../../orpc";

// Stored outside Immer to avoid proxying (AbortController is not proxy-safe)
let benchmarkController: AbortController | null = null;

type ProviderState = {
  providers: Provider[];
  loaded: boolean;
  benchmarkResults: Record<string, BenchmarkResult>;
  benchmarkingModels: Record<string, boolean>;

  load: () => Promise<void>;
  addProvider: (input: {
    name: string;
    baseURL: string;
    apiKey: string;
    models: Record<string, { displayName?: string }>;
    modelMap: { model?: string; haiku?: string; opus?: string; sonnet?: string };
    envOverrides?: Record<string, string>;
    builtInId?: string;
  }) => Promise<Provider>;
  updateProvider: (id: string, updates: Partial<Omit<Provider, "id">>) => Promise<Provider>;
  removeProvider: (id: string) => Promise<void>;
  benchmarkModel: (
    providerId: string,
    modelId: string,
    signal?: AbortSignal,
  ) => Promise<BenchmarkResult | undefined>;
  benchmarkAll: (providerId: string, modelIds: string[]) => Promise<void>;
  cancelBenchmarks: () => void;
  clearProviderBenchmarkResults: (providerId: string) => void;
};

export const useProviderStore = create<ProviderState>()(
  immer((set, get) => ({
    providers: [],
    loaded: false,
    benchmarkResults: {},
    benchmarkingModels: {},

    load: async () => {
      const providers = await client.provider.list();
      set((state) => {
        state.providers = providers;
        state.loaded = true;
      });
    },

    addProvider: async (input) => {
      const provider = await client.provider.create(input);
      set((state) => {
        state.providers.push(provider);
      });
      return provider;
    },

    updateProvider: async (id, updates) => {
      const provider = await client.provider.update({ id, ...updates });
      set((state) => {
        const idx = state.providers.findIndex((p) => p.id === id);
        if (idx !== -1) state.providers[idx] = provider;
      });
      return provider;
    },

    removeProvider: async (id) => {
      await client.provider.remove({ id });
      set((state) => {
        state.providers = state.providers.filter((p) => p.id !== id);
      });
    },

    benchmarkModel: async (providerId, modelId, signal) => {
      const key = `${providerId}:${modelId}`;
      if (get().benchmarkingModels[key]) return get().benchmarkResults[key];

      set((state) => {
        state.benchmarkingModels[key] = true;
      });
      try {
        const result = await client.provider.benchmarkModel(
          { providerId, modelId },
          ...(signal ? [{ signal }] : []),
        );
        set((state) => {
          state.benchmarkResults[key] = result;
        });
        return result;
      } finally {
        set((state) => {
          delete state.benchmarkingModels[key];
        });
      }
    },

    benchmarkAll: async (providerId, modelIds) => {
      benchmarkController?.abort();

      const controller = new AbortController();
      benchmarkController = controller;

      try {
        for (const modelId of modelIds) {
          if (controller.signal.aborted) break;
          await get().benchmarkModel(providerId, modelId, controller.signal);
        }
      } finally {
        if (benchmarkController === controller) {
          benchmarkController = null;
        }
      }
    },

    cancelBenchmarks: () => {
      if (benchmarkController) {
        benchmarkController.abort();
        benchmarkController = null;
        set((state) => {
          state.benchmarkingModels = {};
        });
      }
    },

    clearProviderBenchmarkResults: (providerId) => {
      set((state) => {
        for (const key of Object.keys(state.benchmarkResults)) {
          if (key.startsWith(`${providerId}:`)) {
            delete state.benchmarkResults[key];
          }
        }
      });
    },
  })),
);
