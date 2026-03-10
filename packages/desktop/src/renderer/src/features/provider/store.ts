import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { Provider } from "../../../../shared/features/provider/types";

import { client } from "../../orpc";

type ProviderState = {
  providers: Provider[];
  loaded: boolean;

  load: () => Promise<void>;
  addProvider: (input: {
    name: string;
    baseURL: string;
    apiKey: string;
    models: Record<string, { displayName?: string }>;
    modelMap: { model?: string; haiku?: string; opus?: string; sonnet?: string };
    envOverrides?: Record<string, string>;
  }) => Promise<Provider>;
  updateProvider: (id: string, updates: Partial<Omit<Provider, "id">>) => Promise<Provider>;
  removeProvider: (id: string) => Promise<void>;
};

export const useProviderStore = create<ProviderState>()(
  immer((set) => ({
    providers: [],
    loaded: false,

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
  })),
);
