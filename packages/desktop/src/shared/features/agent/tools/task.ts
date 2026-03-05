import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Task = tool({
  inputSchema: z.object({
    description: z.string(),
    prompt: z.string(),
    subagent_type: z.string(),
  }),
  outputSchema: z.union([
    z.string(),
    z.array(z.object({ type: z.literal("text"), text: z.string() })),
  ]),
});

/** Fully typed tool invocation for the Task tool. */
export type TaskUIToolInvocation = UIToolInvocation<typeof Task>;
