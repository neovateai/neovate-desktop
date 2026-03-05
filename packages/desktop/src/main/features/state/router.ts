import { implement } from "@orpc/server";
import { stateContract } from "../../../shared/features/state/contract";
import type { AppContext } from "../../router";

const os = implement({ state: stateContract }).$context<AppContext>();

export const stateRouter = os.state.router({
  load: os.state.load.handler(({ input, context }) => {
    return context.stateStore.load(input.key);
  }),

  save: os.state.save.handler(({ input, context }) => {
    context.stateStore.save(input.key, input.data);
  }),
});
