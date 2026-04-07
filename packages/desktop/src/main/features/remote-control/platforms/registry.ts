import type { RemoteControlPlatformAdapter } from "./types";

export class PlatformAdapterRegistry {
  private adapters = new Map<string, RemoteControlPlatformAdapter>();

  register(adapter: RemoteControlPlatformAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(platformId: string): RemoteControlPlatformAdapter | undefined {
    return this.adapters.get(platformId);
  }

  getAll(): RemoteControlPlatformAdapter[] {
    return [...this.adapters.values()];
  }

  has(platformId: string): boolean {
    return this.adapters.has(platformId);
  }
}
