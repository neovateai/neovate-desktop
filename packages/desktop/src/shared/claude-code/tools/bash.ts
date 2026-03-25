import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Bash = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#bash
  inputSchema: z.object({
    /**
     * The command to execute
     */
    command: z.string(),
    /**
     * Optional timeout in milliseconds (max 600000)
     */
    timeout: z.number().optional(),
    /**
     * Clear, concise description of what this command does in 5-10 words
     */
    description: z.string().optional(),
    /**
     * Set to true to run this command in the background
     */
    run_in_background: z.boolean().optional(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#bash-2
  // TODO real output is content string, but doc define is object
  outputSchema: z.string(),
});

export type BashUIToolInvocation = UIToolInvocation<typeof Bash>;
