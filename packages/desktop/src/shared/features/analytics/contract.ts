import { oc } from "@orpc/contract";
import { z } from "zod";

export const trackInputSchema = z.object({
  event: z.string().regex(/^[a-z]+(\.[a-z]+){2,}$/),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const analyticsContract = {
  track: oc.input(trackInputSchema),
};
