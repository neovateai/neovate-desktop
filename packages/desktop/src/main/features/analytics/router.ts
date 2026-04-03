import { implement } from "@orpc/server";
import debug from "debug";

import type { AppContext } from "../../router";

import { analyticsContract } from "../../../shared/features/analytics/contract";

const log = debug("neovate:analytics");

const os = implement({ analytics: analyticsContract }).$context<AppContext>();

export const analyticsRouter = os.analytics.router({
  track: os.analytics.track.handler(async ({ input, context }) => {
    try {
      await context.mainApp.analytics.track(input.event, input.properties ?? {});
    } catch (error) {
      log("track error: %O", error);
    }
  }),
});
