import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AppConfig, Theme } from "../../../../shared/features/config/types";
import { client } from "../../orpc";

type ConfigState = AppConfig & {
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (theme: Theme) => void;
};

export const useConfigStore = create<ConfigState>()(
  immer((set) => ({
    theme: "system",
    loaded: false,

    load: async () => {
      const config = await client.config.get();
      set((state) => {
        state.theme = config.theme;
        state.loaded = true;
      });
    },

    setTheme: (theme) => {
      client.config.set({ key: "theme", value: theme }).catch(() => {});
      set((state) => {
        state.theme = theme;
      });
    },
  })),
);
