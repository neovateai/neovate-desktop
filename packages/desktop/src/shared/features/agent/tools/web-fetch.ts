import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const WebFetch = tool({
  inputSchema: z.object({
    url: z.string(),
    prompt: z.string(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the WebFetch tool. */
export type WebFetchUIToolInvocation = UIToolInvocation<typeof WebFetch>;
