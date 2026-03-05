import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const SlashCommand = tool({
  inputSchema: z.object({
    name: z.string(),
    prompt: z.string().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the SlashCommand tool. */
export type SlashCommandUIToolInvocation = UIToolInvocation<typeof SlashCommand>;
