import { implement } from "@orpc/server";
import { app } from "electron";

import type { AppContext } from "../../router";

import { updaterContract } from "../../../shared/features/updater/contract";

const os = implement({ updater: updaterContract }).$context<AppContext>();

export const updaterRouter = os.updater.router({
  check: os.updater.check.handler(({ context }) => {
    context.updaterService.check(true);
  }),

  install: os.updater.install.handler(({ context }) => {
    context.updaterService.install();
  }),

  getVersion: os.updater.getVersion.handler(() => app.getVersion()),

  subscribe: os.updater.subscribe.handler(async function* ({ signal, context }) {
    yield context.updaterService.getState();
    for await (const s of context.updaterService.publisher.subscribe("state", { signal })) {
      yield s;
    }
  }),
});
