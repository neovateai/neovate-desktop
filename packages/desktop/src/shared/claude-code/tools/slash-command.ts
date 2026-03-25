import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

import { normalizedToolOutputSchema } from "./normalized-output";

export const SlashCommand = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/slash-commands
  inputSchema: z.object({
    /**
     * The slash command to execute, including the leading /
     */
    command: z.string(),
  }),
  outputSchema: normalizedToolOutputSchema,
});

export type SlashCommandUIToolInvocation = UIToolInvocation<typeof SlashCommand>;
