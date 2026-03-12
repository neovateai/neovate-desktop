import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const ExitPlanModeInputSchema = z.object({
  /**
   * The plan to run by the user for approval
   */
  plan: z.string(),
});

export const ExitPlanMode = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#exitplanmode
  inputSchema: ExitPlanModeInputSchema,
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#exitplanmode-2
  outputSchema: z.string(),
});

export type ExitPlanModeUIToolInvocation = UIToolInvocation<typeof ExitPlanMode>;
