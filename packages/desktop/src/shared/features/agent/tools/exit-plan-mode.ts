import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const ExitPlanMode = tool({
  inputSchema: z.object({
    allowedPrompts: z.array(z.string()).optional(),
  }),
  outputSchema: z.void(),
});

/** Fully typed tool invocation for the ExitPlanMode tool. */
export type ExitPlanModeUIToolInvocation = UIToolInvocation<typeof ExitPlanMode>;
