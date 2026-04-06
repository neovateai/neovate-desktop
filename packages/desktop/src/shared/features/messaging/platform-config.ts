import { z } from "zod";

export const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  allowedChatIds: z.array(z.string()),
  enabled: z.boolean(),
});

/** Union of all platform config schemas, keyed by platform ID */
export const platformConfigSchemas: Record<string, z.ZodType> = {
  telegram: telegramConfigSchema,
};
