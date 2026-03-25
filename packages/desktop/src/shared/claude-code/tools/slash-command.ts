import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const SlashCommand = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/slash-commands
  inputSchema: z.object({
    /**
     * The slash command to execute, including the leading /
     */
    command: z.string(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/slash-commands
  outputSchema: z.string(),
});

export type SlashCommandUIToolInvocation = UIToolInvocation<typeof SlashCommand>;
