import type { IScopedSettings, ISettingsService } from "../../core/types";
import { useSettingsStore } from "./store";

export class SettingsService implements ISettingsService {
  scoped(namespace: string): IScopedSettings {
    return new ScopedSettings(namespace);
  }
}

class ScopedSettings implements IScopedSettings {
  constructor(private namespace: string) {}

  private prefixed(key: string): string {
    return `${this.namespace}.${key}`;
  }

  get<T = unknown>(key: string): T | undefined {
    return useSettingsStore.getState().get<T>(this.prefixed(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    await useSettingsStore.getState().set(this.prefixed(key), value);
  }

  getAll(): Record<string, unknown> {
    const data = useSettingsStore.getState().data;
    return (data[this.namespace] as Record<string, unknown>) ?? {};
  }

  subscribe(listener: (data: Record<string, unknown>) => void): () => void {
    return useSettingsStore.subscribe(
      (state) => (state.data[this.namespace] as Record<string, unknown>) ?? {},
      listener,
    );
  }
}
