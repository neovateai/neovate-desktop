import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const WebSearch = tool({
  inputSchema: z.object({
    query: z.string(),
    allowed_domains: z.array(z.string()).optional(),
    blocked_domains: z.array(z.string()).optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the WebSearch tool. */
export type WebSearchUIToolInvocation = UIToolInvocation<typeof WebSearch>;
