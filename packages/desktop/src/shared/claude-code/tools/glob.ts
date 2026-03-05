import { createProviderToolFactoryWithOutputSchema } from "@ai-sdk/provider-utils";
import { type UIToolInvocation } from "ai";
import { z } from "zod";

export const Glob = createProviderToolFactoryWithOutputSchema({
  id: "claude-code.Glob",
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#glob
  inputSchema: z.object({
    /**
     * The glob pattern to match files against
     */
    pattern: z.string(),
    /**
     * The directory to search in (defaults to cwd)
     */
    path: z.string().optional(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#glob-2
  outputSchema: z.string(),
})({});

export type GlobUIToolInvocation = UIToolInvocation<typeof Glob>;
