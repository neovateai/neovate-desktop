import { implement } from "@orpc/server";

import type { AppContext } from "../../router";

import { deeplinkContract } from "../../../shared/features/deeplink/contract";

const os = implement({ deeplink: deeplinkContract }).$context<AppContext>();

export const deeplinkRouter = os.deeplink.router({
  subscribe: os.deeplink.subscribe.handler(async function* ({ context, signal }) {
    const service = context.mainApp.deeplink;

    // 1. Register listener FIRST (new events buffered in iterator from here)
    const iterator = service.publisher.subscribe("deeplink", { signal });

    // 2. Yield pending events (published before any subscriber existed)
    for (const event of service.consumePending()) {
      yield event;
    }

    // 3. Yield real-time stream (seamless, no gap)
    for await (const event of iterator) {
      yield event;
    }
  }),
});
