import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

import { normalizedToolOutputSchema } from "./normalized-output";

export const Glob = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#glob
  inputSchema: z.object({
    /**
     * The glob pattern to match files against
     */
    pattern: z.string(),
    /**
     * The directory to search in (defaults to cwd)
     */
    path: z.string().optional(),
  }),
  outputSchema: normalizedToolOutputSchema,
});

export type GlobUIToolInvocation = UIToolInvocation<typeof Glob>;
