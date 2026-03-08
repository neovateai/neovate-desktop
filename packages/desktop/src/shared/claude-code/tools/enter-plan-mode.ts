import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const EnterPlanMode = tool({
  inputSchema: z.object({}),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the EnterPlanMode tool. */
export type EnterPlanModeUIToolInvocation = UIToolInvocation<typeof EnterPlanMode>;
