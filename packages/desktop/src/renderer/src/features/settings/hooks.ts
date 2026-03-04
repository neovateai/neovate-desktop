import { useStore } from "zustand";
import { useRendererApp } from "../../core";
import type { SettingsState } from "./store";

export function useSettings<T>(selector: (state: SettingsState) => T): T {
  const { settings } = useRendererApp();
  return useStore(settings.store, selector);
}
