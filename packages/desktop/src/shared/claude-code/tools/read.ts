import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

import { normalizedToolOutputSchema } from "./normalized-output";

export const Read = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#read
  inputSchema: z.object({
    /**
     * The absolute path to the file to read
     */
    file_path: z.string(),
    /**
     * The line number to start reading from
     */
    offset: z.number().optional(),
    /**
     * The number of lines to read
     */
    limit: z.number().optional(),
  }),
  outputSchema: normalizedToolOutputSchema,
});

export type ReadUIToolInvocation = UIToolInvocation<typeof Read>;
