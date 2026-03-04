import { oc, type } from "@orpc/contract";
import { z } from "zod";

export const storageContract = {
  settings: {
    getAll: oc.output(type<Record<string, unknown>>()),
    get: oc.input(z.object({ key: z.string() })).output(type<unknown>()),
    set: oc.input(z.object({ key: z.string(), value: z.unknown() })).output(type<void>()),
  },
};
