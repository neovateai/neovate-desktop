import { implement } from "@orpc/server";
import { storageContract } from "../../../shared/features/storage/contract";
import type { AppContext } from "../../router";

const os = implement({ storage: storageContract }).$context<AppContext>();

export const storageRouter = os.storage.router({
  settings: os.storage.settings.router({
    getAll: os.storage.settings.getAll.handler(({ context }) => {
      const config = context.storage.scoped("config");
      return config.get<Record<string, unknown>>("settings") ?? {};
    }),

    get: os.storage.settings.get.handler(({ input, context }) => {
      const config = context.storage.scoped("config");
      return config.get(`settings.${input.key}`);
    }),

    set: os.storage.settings.set.handler(({ input, context }) => {
      const config = context.storage.scoped("config");
      config.set(`settings.${input.key}`, input.value);
    }),
  }),
});
