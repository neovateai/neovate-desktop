import { useEffect } from "react";
import { useSettingsStore } from "../store";

export function useSettings() {
  const store = useSettingsStore();

  useEffect(() => {
    void store.fetch();
  }, []);

  return {
    settings: store.data,
    loading: store.loading,
    getSetting: store.get,
    setSetting: store.set,
  };
}
