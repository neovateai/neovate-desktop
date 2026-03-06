import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Agent = tool({
  inputSchema: z.object({
    subagent_type: z.string(),
    description: z.string(),
    prompt: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
    agentId: z.string().optional(),
    usage: z
      .object({
        total_tokens: z.number(),
        tool_uses: z.number(),
        duration_ms: z.number(),
      })
      .optional(),
  }),
});

/** Fully typed tool invocation for the Agent tool. */
export type AgentUIToolInvocation = UIToolInvocation<typeof Agent>;
