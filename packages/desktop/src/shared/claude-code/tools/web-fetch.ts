import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

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
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#webfetch-2
  outputSchema: z.string(),
});

export type WebFetchUIToolInvocation = UIToolInvocation<typeof WebFetch>;
