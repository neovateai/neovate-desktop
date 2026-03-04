import { implement } from "@orpc/server";
import { storageContract } from "../../../shared/features/storage/contract";
import type { AppContext } from "../../router";

const os = implement({ storage: storageContract }).$context<AppContext>();

export const storageRouter = os.storage.router({
  get: os.storage.get.handler(({ input, context }) => {
    return context.storage.scoped(input.namespace).get(input.key);
  }),

  set: os.storage.set.handler(({ input, context }) => {
    context.storage.scoped(input.namespace).set(input.key, input.value);
  }),

  getAll: os.storage.getAll.handler(({ input, context }) => {
    return context.storage.scoped(input.namespace).getAll();
  }),
});
