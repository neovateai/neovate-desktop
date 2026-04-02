import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { LlmQueryResult } from "./types";

const llmMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const llmQueryOptionsSchema = z.object({
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const llmContract = {
  isConfigured: oc.output(type<{ configured: boolean }>()),

  query: oc
    .input(z.object({ prompt: z.string() }).merge(llmQueryOptionsSchema))
    .output(type<{ content: string }>()),

  queryMessages: oc
    .input(z.object({ messages: z.array(llmMessageSchema) }).merge(llmQueryOptionsSchema))
    .output(type<LlmQueryResult>()),
};
