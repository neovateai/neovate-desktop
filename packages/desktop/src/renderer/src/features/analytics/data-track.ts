import debug from "debug";

import { client } from "../../orpc";

const log = debug("neovate:analytics:click");

export function initClickTracking(): () => void {
  const handler = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
    if (!el) return;

    const event = el.dataset.trackId!;
    log("tracked: %s", event);
    client.analytics.track({ event, properties: { trackType: "declarative-dom" } }).catch(() => {});
  };

  document.addEventListener("click", handler);
  log("initClickTracking: listener attached");
  return () => document.removeEventListener("click", handler);
}
