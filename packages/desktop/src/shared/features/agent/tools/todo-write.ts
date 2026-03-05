import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const TodoWrite = tool({
  inputSchema: z.object({
    todos: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        status: z.string(),
        priority: z.string(),
      }),
    ),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the TodoWrite tool. */
export type TodoWriteUIToolInvocation = UIToolInvocation<typeof TodoWrite>;
