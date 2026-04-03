import { EventPublisher } from "@orpc/server";
import debug from "debug";

import type { DeeplinkEvent } from "../../../shared/features/deeplink/contract";
import type { DeeplinkHandler } from "./types";

const log = debug("neovate:deeplink");

export class DeeplinkService {
  readonly publisher = new EventPublisher<{ deeplink: DeeplinkEvent }>();
  private buffer: string[] = [];
  private handlers = new Map<string, DeeplinkHandler>();
  private pending: DeeplinkEvent[] = [];
  private ready = false;

  register(name: string, handler: DeeplinkHandler): void {
    if (this.handlers.has(name)) {
      log("handler name collision, ignoring: %s", name);
      return;
    }
    this.handlers.set(name, handler);
  }

  handle(url: string): void {
    if (!this.ready) {
      log("buffering deeplink (not ready): %s", url);
      this.buffer.push(url);
      return;
    }
    void this.dispatch(url);
  }

  async activate(): Promise<void> {
    this.ready = true;
    log("activating, flushing %d buffered URLs", this.buffer.length);
    for (const url of this.buffer) {
      await this.dispatch(url);
    }
    this.buffer = [];
  }

  /** Take and clear pending renderer events. Called by subscribe handler. */
  consumePending(): DeeplinkEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  dispose(): void {
    this.buffer = [];
    this.pending = [];
    this.handlers.clear();
  }

  private async dispatch(url: string): Promise<void> {
    const parsed = this.parse(url);
    if (!parsed) {
      log("failed to parse deeplink URL: %s", url);
      return;
    }

    const { name, path, searchParams } = parsed;
    const handler = this.handlers.get(name);
    const unhandled = !handler;

    let data: unknown;
    if (handler) {
      try {
        data = await handler.handle({ path, searchParams });
      } catch (err) {
        log("main handler error for %s: %O", name, err);
        return;
      }
    }

    const event: DeeplinkEvent = {
      name,
      path,
      searchParams: Object.fromEntries(searchParams),
      data,
      unhandled,
    };

    if (this.publisher.size > 0) {
      this.publisher.publish("deeplink", event);
    } else {
      this.pending.push(event);
    }
  }

  private parse(url: string): { name: string; path: string; searchParams: URLSearchParams } | null {
    try {
      const parsed = new URL(url);
      return {
        name: parsed.hostname,
        path: parsed.pathname,
        searchParams: parsed.searchParams,
      };
    } catch {
      return null;
    }
  }
}
