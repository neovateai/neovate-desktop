import { oc } from "@orpc/contract";
import { z } from "zod";

export const trackInputSchema = z.object({
  event: z.string().regex(/^[a-z]+(\.[a-z]+){2,}$/),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export const analyticsContract = {
  track: oc.input(trackInputSchema),
};
