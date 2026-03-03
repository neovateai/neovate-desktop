import { implement } from "@orpc/server";
import { configContract } from "../../../shared/features/config/contract";
import type { AppContext } from "../../router";

const os = implement({ config: configContract }).$context<AppContext>();

export const configRouter = os.config.router({
  get: os.config.get.handler(({ context }) => {
    return context.configStore.getAll();
  }),

  set: os.config.set.handler(({ input, context }) => {
    context.configStore.set(input.key, input.value);
  }),
});
