import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const KillShell = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#killbash
  inputSchema: z.object({
    /**
     * The ID of the background shell to kill
     */
    shell_id: z.string(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#killbash-2
  outputSchema: z.string(),
});

export type KillShellUIToolInvocation = UIToolInvocation<typeof KillShell>;
