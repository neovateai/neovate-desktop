import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const EnterWorktree = tool({
  inputSchema: z.object({
    name: z.string().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the EnterWorktree tool. */
export type EnterWorktreeUIToolInvocation = UIToolInvocation<typeof EnterWorktree>;
