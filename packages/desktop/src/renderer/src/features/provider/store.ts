import debug from "debug";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { BenchmarkResult, Provider } from "../../../../shared/features/provider/types";

import { client } from "../../orpc";

const log = debug("neovate:provider");

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
  checkAll: (baseURL: string, apiKey: string, modelIds: string[]) => Promise<void>;
  cancelBenchmarks: () => void;
  clearBenchmarkResults: (baseURL: string) => void;
};

export const useProviderStore = create<ProviderState>()(
  immer((set, get) => ({
    providers: [],
    loaded: false,
    benchmarkResults: {},
    benchmarkingModels: {},

    load: async () => {
      const providers = await client.provider.list();
      log("loaded %d providers", providers.length);
      set((state) => {
        state.providers = providers;
        state.loaded = true;
      });
    },

    addProvider: async (input) => {
      const provider = await client.provider.create(input);
      log("provider added: id=%s name=%s", provider.id, provider.name);
      set((state) => {
        state.providers.push(provider);
      });
      return provider;
    },

    updateProvider: async (id, updates) => {
      const provider = await client.provider.update({ id, ...updates });
      log("provider updated: id=%s", id);
      set((state) => {
        const idx = state.providers.findIndex((p) => p.id === id);
        if (idx !== -1) state.providers[idx] = provider;
      });
      return provider;
    },

    removeProvider: async (id) => {
      log("removing provider: id=%s", id);
      await client.provider.remove({ id });
      set((state) => {
        state.providers = state.providers.filter((p) => p.id !== id);
      });
    },

    checkAll: async (baseURL, apiKey, modelIds) => {
      log("checkAll: baseURL=%s models=%o", baseURL, modelIds);
      benchmarkController?.abort();

      const controller = new AbortController();
      benchmarkController = controller;

      try {
        for (const modelId of modelIds) {
          if (controller.signal.aborted) break;
          const key = `${baseURL}:${modelId}`;
          if (get().benchmarkingModels[key]) continue;

          log("checking model: %s", modelId);
          set((state) => {
            delete state.benchmarkResults[key];
            state.benchmarkingModels[key] = true;
          });
          try {
            const result = await client.provider.checkModel(
              { baseURL, apiKey, modelId },
              { signal: controller.signal },
            );
            log("model check result: %s success=%s", modelId, result.success);
            set((state) => {
              state.benchmarkResults[key] = result;
            });
          } finally {
            set((state) => {
              delete state.benchmarkingModels[key];
            });
          }
        }
      } finally {
        if (benchmarkController === controller) {
          benchmarkController = null;
        }
      }
    },

    cancelBenchmarks: () => {
      if (benchmarkController) {
        log("canceling benchmarks");
        benchmarkController.abort();
        benchmarkController = null;
        set((state) => {
          state.benchmarkingModels = {};
        });
      }
    },

    clearBenchmarkResults: (baseURL) => {
      set((state) => {
        for (const key of Object.keys(state.benchmarkResults)) {
          if (key.startsWith(`${baseURL}:`)) {
            delete state.benchmarkResults[key];
          }
        }
      });
    },
  })),
);
