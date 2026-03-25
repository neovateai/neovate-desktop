import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

import { normalizedToolOutputSchema } from "./normalized-output";

export const ExitPlanModeInputSchema = z.object({
  /**
   * The plan to run by the user for approval
   */
  plan: z.string(),
});

export const ExitPlanMode = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#exitplanmode
  inputSchema: ExitPlanModeInputSchema,
  outputSchema: normalizedToolOutputSchema,
});

export type ExitPlanModeUIToolInvocation = UIToolInvocation<typeof ExitPlanMode>;
