import { tool, type UIMessage, type UIToolInvocation } from "ai";
import { z } from "zod";

const agentOutputSchema = z.custom<UIMessage>(
  (value) =>
    value != null &&
    typeof value === "object" &&
    "id" in value &&
    "role" in value &&
    "parts" in value,
  "Expected a UIMessage-like object",
);

export const Agent = tool({
  inputSchema: z.object({
    subagent_type: z.string(),
    description: z.string(),
    prompt: z.string(),
  }),
  outputSchema: agentOutputSchema,
});

/** Fully typed tool invocation for the Agent tool. */
export type AgentUIToolInvocation = UIToolInvocation<typeof Agent>;
