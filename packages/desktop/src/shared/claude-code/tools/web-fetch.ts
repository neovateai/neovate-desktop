import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

import { normalizedToolOutputSchema } from "./normalized-output";

export const WebFetch = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#webfetch
  inputSchema: z.object({
    /**
     * The URL to fetch content from
     */
    url: z.string(),
    /**
     * The prompt to run on the fetched content
     */
    prompt: z.string(),
  }),
  outputSchema: normalizedToolOutputSchema,
});

export type WebFetchUIToolInvocation = UIToolInvocation<typeof WebFetch>;
