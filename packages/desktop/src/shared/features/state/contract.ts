import { oc, type } from "@orpc/contract";
import { z } from "zod";

export const stateContract = {
  load: oc.input(z.object({ key: z.string() })).output(type<unknown>()),

  save: oc.input(z.object({ key: z.string(), data: z.unknown() })).output(type<void>()),
};
