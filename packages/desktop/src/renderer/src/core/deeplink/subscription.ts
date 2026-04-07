import debug from "debug";

import type { DeeplinkEvent } from "../../../../shared/features/deeplink/contract";

import { toastManager } from "../../components/ui/toast";

const log = debug("neovate:deeplink");

export type DeeplinkHandler = (event: DeeplinkEvent) => void;

export async function startDeeplinkSubscription(
  subscribe: () => Promise<AsyncIterable<DeeplinkEvent>>,
  handlers: Map<string, DeeplinkHandler>,
): Promise<void> {
  try {
    for await (const event of await subscribe()) {
      log("received event: name=%s unhandled=%s", event.name, event.unhandled);
      const handler = handlers.get(event.name);
      if (handler) {
        try {
          handler(event);
        } catch (err) {
          log("renderer handler error: %s %O", event.name, err);
        }
      } else if (event.unhandled) {
        toastManager.add({ type: "warning", title: `Unknown deeplink: ${event.name}` });
      }
    }
  } catch {
    // subscription ended
  }
}
