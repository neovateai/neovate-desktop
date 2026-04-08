import { z } from "zod";

export const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  allowedChatIds: z.array(z.string()),
  enabled: z.boolean(),
});

export const dingtalkConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  robotCode: z.string().min(1),
  allowFrom: z.array(z.string()),
  enabled: z.boolean(),
});

export const wechatConfigSchema = z.object({
  token: z.string().min(1),
  accountId: z.string().min(1),
  baseUrl: z.string().min(1),
  userId: z.string().optional(),
  allowFrom: z.array(z.string()),
  enabled: z.boolean(),
  syncCursor: z.string().optional(),
});

/** Union of all platform config schemas, keyed by platform ID */
export const platformConfigSchemas: Record<string, z.ZodType> = {
  telegram: telegramConfigSchema,
  dingtalk: dingtalkConfigSchema,
  wechat: wechatConfigSchema,
};
