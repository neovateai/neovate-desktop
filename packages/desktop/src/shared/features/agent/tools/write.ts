import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Write = tool({
  inputSchema: z.object({
    file_path: z.string(),
    content: z.string(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Write tool. */
export type WriteUIToolInvocation = UIToolInvocation<typeof Write>;
