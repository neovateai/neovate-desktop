import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Read = tool({
  inputSchema: z.object({
    file_path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
    pages: z.number().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Read tool. */
export type ReadUIToolInvocation = UIToolInvocation<typeof Read>;
