import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Bash = tool({
  inputSchema: z.object({
    command: z.string(),
    timeout: z.number().optional(),
    description: z.string().optional(),
    run_in_background: z.boolean().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Bash tool. */
export type BashUIToolInvocation = UIToolInvocation<typeof Bash>;
