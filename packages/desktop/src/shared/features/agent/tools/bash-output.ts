import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const BashOutput = tool({
  inputSchema: z.object({
    shell_id: z.string(),
    timeout: z.number().optional(),
    block: z.boolean().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the BashOutput tool. */
export type BashOutputUIToolInvocation = UIToolInvocation<typeof BashOutput>;
