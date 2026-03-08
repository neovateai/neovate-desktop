import { implement } from "@orpc/server";
import { updaterContract } from "../../../shared/features/updater/contract";
import type { AppContext } from "../../router";

const os = implement({ updater: updaterContract }).$context<AppContext>();

export const updaterRouter = os.updater.router({
  check: os.updater.check.handler(({ context }) => {
    context.updaterService.check();
  }),

  install: os.updater.install.handler(({ context }) => {
    context.updaterService.install();
  }),

  watchState: os.updater.watchState.handler(async function* ({
    signal,
    context,
  }) {
    yield* context.updaterService.watchState(signal);
  }),
});
