import { oc, type } from "@orpc/contract";
import { z } from "zod";
import type { AppConfig } from "./types";

export const configContract = {
  get: oc.output(type<AppConfig>()),

  set: oc
    .input(z.object({ key: z.literal("theme"), value: z.enum(["system", "light", "dark"]) }))
    .output(type<void>()),
};
