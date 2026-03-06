import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const TaskOutput = tool({
  inputSchema: z.object({
    task_id: z.string(),
    block: z.boolean().default(true),
    timeout: z.number().min(0).max(600000).default(30000),
  }),
  outputSchema: z.object({
    status: z.enum(["running", "completed", "failed", "stopped"]),
    output: z.string().optional(),
    error: z.string().optional(),
  }),
});

/** Fully typed tool invocation for the TaskOutput tool. */
export type TaskOutputUIToolInvocation = UIToolInvocation<typeof TaskOutput>;
