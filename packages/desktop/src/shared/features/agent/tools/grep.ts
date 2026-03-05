import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Grep = tool({
  inputSchema: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    glob: z.string().optional(),
    output_mode: z.string().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Grep tool. */
export type GrepUIToolInvocation = UIToolInvocation<typeof Grep>;
