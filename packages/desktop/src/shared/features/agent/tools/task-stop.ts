import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const TaskStop = tool({
  inputSchema: z.object({
    task_id: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }),
});

/** Fully typed tool invocation for the TaskStop tool. */
export type TaskStopUIToolInvocation = UIToolInvocation<typeof TaskStop>;
