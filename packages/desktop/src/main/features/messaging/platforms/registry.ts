import type { MessagingPlatformAdapter } from "./types";

export class PlatformAdapterRegistry {
  private adapters = new Map<string, MessagingPlatformAdapter>();

  register(adapter: MessagingPlatformAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(platformId: string): MessagingPlatformAdapter | undefined {
    return this.adapters.get(platformId);
  }

  getAll(): MessagingPlatformAdapter[] {
    return [...this.adapters.values()];
  }

  has(platformId: string): boolean {
    return this.adapters.has(platformId);
  }
}
