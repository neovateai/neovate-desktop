import { tool } from "ai";
import { z } from "zod";

export const ReadMcpResource = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#readmcpresource
  inputSchema: z.object({
    /**
     * The MCP server name
     */
    server: z.string(),
    /**
     * The resource URI to read
     */
    uri: z.string(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#readmcpresource-2
  outputSchema: z.object({
    /**
     * Resource contents
     */
    contents: z.array(
      z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional(),
      }),
    ),
    /**
     * Server that provided the resource
     */
    server: z.string(),
  }),
});
