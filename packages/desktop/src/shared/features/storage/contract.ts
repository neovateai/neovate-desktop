import { oc, type } from "@orpc/contract";
import { z } from "zod";

export const storageContract = {
  get: oc
    .input(z.object({ namespace: z.string(), key: z.string() }))
    .output(type<unknown>()),
  set: oc
    .input(z.object({ namespace: z.string(), key: z.string(), value: z.unknown() }))
    .output(type<void>()),
  getAll: oc
    .input(z.object({ namespace: z.string() }))
    .output(type<Record<string, unknown>>()),
};
