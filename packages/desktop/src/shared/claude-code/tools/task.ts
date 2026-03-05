import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Task = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#task
  inputSchema: z.object({
    /**
     * A short (3-5 word) description of the task
     */
    description: z.string(),
    /**
     * The task for the agent to perform
     */
    prompt: z.string(),
    /**
     * The type of specialized agent to use for this task
     */
    subagent_type: z.string(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#task-2
  outputSchema: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.literal("text"),
        text: z.string(),
      }),
    ),
  ]),
});

export type TaskUIToolInvocation = UIToolInvocation<typeof Task>;
