import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const ExitPlanModeInputSchema = z.object({
  /** Prompt-based permissions needed to implement the plan (model-provided). */
  allowedPrompts: z.array(z.object({ tool: z.string(), prompt: z.string() })).optional(),
  /** The plan content (injected by SDK from disk). */
  plan: z.string().optional(),
  /** The plan file path (injected by SDK). */
  planFilePath: z.string().optional(),
});

export const ExitPlanMode = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#exitplanmode
  inputSchema: ExitPlanModeInputSchema,
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#exitplanmode-2
  outputSchema: z.string(),
});

export type ExitPlanModeUIToolInvocation = UIToolInvocation<typeof ExitPlanMode>;
