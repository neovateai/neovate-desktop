import { tool } from "ai";
import { z } from "zod";

export const ListMcpResources = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#listmcpresources
  inputSchema: z.object({
    /**
     * Optional server name to filter resources by
     */
    server: z.string().optional(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#listmcpresources-2
  outputSchema: z.object({
    /**
     * Available resources
     */
    resources: z.array(
      z.object({
        uri: z.string(),
        name: z.string(),
        description: z.string().optional(),
        mimeType: z.string().optional(),
        server: z.string(),
      }),
    ),
    /**
     * Total number of resources
     */
    total: z.number(),
  }),
});
