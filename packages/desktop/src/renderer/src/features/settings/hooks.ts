import { useStore } from "zustand";

import type { SettingsState } from "./store";

import { useRendererApp } from "../../core";

export function useSettings<T>(selector: (state: SettingsState) => T): T {
  const { settings } = useRendererApp();
  return useStore(settings.store, selector);
}
