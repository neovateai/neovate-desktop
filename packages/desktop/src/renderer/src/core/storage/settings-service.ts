import { useSettingsStore } from "../../features/settings/store";

export interface IScopedRendererSettings {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
  getAll(): Record<string, unknown>;
  subscribe(listener: (data: Record<string, unknown>) => void): () => void;
}

export interface IRendererSettingsService {
  scoped(namespace: string): IScopedRendererSettings;
}

export class RendererSettingsService implements IRendererSettingsService {
  scoped(namespace: string): IScopedRendererSettings {
    return new ScopedRendererSettings(namespace);
  }
}

class ScopedRendererSettings implements IScopedRendererSettings {
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
