import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const KillShell = tool({
  inputSchema: z.object({
    shell_id: z.string(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the KillShell tool. */
export type KillShellUIToolInvocation = UIToolInvocation<typeof KillShell>;
