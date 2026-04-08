import type { AnalyticsInstance } from "analytics";

import debug from "debug";

const log = debug("neovate:analytics:click");

export function initClickTracking(analytics: AnalyticsInstance): () => void {
  const handler = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
    if (!el) return;

    const event = el.dataset.trackId!;
    log("tracked: %s", event);
    Promise.resolve(analytics.track(event, { trackType: "declarative-dom" })).catch(() => {});
  };

  document.addEventListener("click", handler);
  log("initClickTracking: listener attached");
  return () => document.removeEventListener("click", handler);
}

export function initMessageSentTracking(analytics: AnalyticsInstance): () => void {
  const handler = (e: Event) => {
    const { metadata } = (e as CustomEvent<{ metadata?: Record<string, unknown> }>).detail;
    log("tracked: chat.message.sent metadata=%o", metadata);
    Promise.resolve(
      analytics.track("chat.message.sent", { metadata, trackType: "programmatic" }),
    ).catch(() => {});
  };

  window.addEventListener("neovate:message-sent", handler);
  log("initMessageSentTracking: listener attached");
  return () => window.removeEventListener("neovate:message-sent", handler);
}
