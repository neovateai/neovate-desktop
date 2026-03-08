import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Skill = tool({
  inputSchema: z.object({
    skill: z.string(),
    args: z.string().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Skill tool. */
export type SkillUIToolInvocation = UIToolInvocation<typeof Skill>;
