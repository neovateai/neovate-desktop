import debug from "debug";

import { client } from "../../orpc";

const log = debug("neovate:analytics:click");

export function initClickTracking(): () => void {
  const handler = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("[data-track]");
    if (!el) return;

    const event = el.getAttribute("data-track")!;
    const properties: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith("data-track-") && attr.name !== "data-track") {
        properties[attr.name.slice(11)] = attr.value;
      }
    }

    log("tracked: %s %o", event, properties);
    client.analytics.track({ event, properties }).catch(() => {});
  };

  document.addEventListener("click", handler);
  log("initClickTracking: listener attached");
  return () => document.removeEventListener("click", handler);
}
