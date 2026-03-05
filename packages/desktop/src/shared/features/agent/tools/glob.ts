import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Glob = tool({
  inputSchema: z.object({
    pattern: z.string(),
    path: z.string().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Glob tool. */
export type GlobUIToolInvocation = UIToolInvocation<typeof Glob>;
