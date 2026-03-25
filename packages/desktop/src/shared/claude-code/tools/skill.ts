import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

import { normalizedToolOutputSchema } from "./normalized-output";

export const Skill = tool({
  inputSchema: z.object({
    skill: z.string(),
    args: z.string().optional(),
  }),
  outputSchema: normalizedToolOutputSchema,
});

/** Fully typed tool invocation for the Skill tool. */
export type SkillUIToolInvocation = UIToolInvocation<typeof Skill>;
