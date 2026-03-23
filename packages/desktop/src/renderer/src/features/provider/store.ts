import debug from "debug";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { ModelTestResult, Provider } from "../../../../shared/features/provider/types";

import { client } from "../../orpc";

const log = debug("neovate:provider");

// Stored outside Immer to avoid proxying (AbortController is not proxy-safe)
let benchmarkController: AbortController | null = null;

type ProviderState = {
  providers: Provider[];
  loaded: boolean;
  modelTestResults: Record<string, ModelTestResult>;
  testingModels: Record<string, boolean>;

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
  quickCheckAll: (baseURL: string, apiKey: string, modelIds: string[]) => Promise<void>;
  benchmarkAll: (baseURL: string, apiKey: string, modelIds: string[]) => Promise<void>;
  cancelTests: () => void;
  clearTestResults: (baseURL: string) => void;
};

export const useProviderStore = create<ProviderState>()(
  immer((set, get) => ({
    providers: [],
    loaded: false,
    modelTestResults: {},
    testingModels: {},

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

    quickCheckAll: async (baseURL, apiKey, modelIds) => {
      log("quickCheckAll: baseURL=%s models=%o", baseURL, modelIds);
      benchmarkController?.abort();

      const controller = new AbortController();
      benchmarkController = controller;

      const keys = modelIds.map((id) => `${baseURL}:${id}`);

      // Mark all as testing
      set((state) => {
        for (const key of keys) {
          delete state.modelTestResults[key];
          state.testingModels[key] = true;
        }
      });

      try {
        const results = await Promise.all(
          modelIds.map((modelId) =>
            client.provider
              .quickCheck({ baseURL, apiKey, modelId }, { signal: controller.signal })
              .then((r) => ({ modelId, ...r })),
          ),
        );

        set((state) => {
          for (const { modelId, success, error } of results) {
            const key = `${baseURL}:${modelId}`;
            state.modelTestResults[key] = { type: "quick", success, error };
          }
        });
      } finally {
        set((state) => {
          for (const key of keys) {
            delete state.testingModels[key];
          }
        });
        if (benchmarkController === controller) {
          benchmarkController = null;
        }
      }
    },

    benchmarkAll: async (baseURL, apiKey, modelIds) => {
      log("benchmarkAll: baseURL=%s models=%o", baseURL, modelIds);
      benchmarkController?.abort();

      const controller = new AbortController();
      benchmarkController = controller;

      try {
        for (const modelId of modelIds) {
          if (controller.signal.aborted) break;
          const key = `${baseURL}:${modelId}`;
          if (get().testingModels[key]) continue;

          log("benchmarking model: %s", modelId);
          set((state) => {
            delete state.modelTestResults[key];
            state.testingModels[key] = true;
          });
          try {
            const result = await client.provider.checkModel(
              { baseURL, apiKey, modelId },
              { signal: controller.signal },
            );
            log("benchmark result: %s success=%s", modelId, result.success);
            set((state) => {
              state.modelTestResults[key] = { type: "benchmark", ...result };
            });
          } finally {
            set((state) => {
              delete state.testingModels[key];
            });
          }
        }
      } finally {
        if (benchmarkController === controller) {
          benchmarkController = null;
        }
      }
    },

    cancelTests: () => {
      if (benchmarkController) {
        log("canceling tests");
        benchmarkController.abort();
        benchmarkController = null;
        set((state) => {
          state.testingModels = {};
        });
      }
    },

    clearTestResults: (baseURL) => {
      set((state) => {
        for (const key of Object.keys(state.modelTestResults)) {
          if (key.startsWith(`${baseURL}:`)) {
            delete state.modelTestResults[key];
          }
        }
      });
    },
  })),
);
