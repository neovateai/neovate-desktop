import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Write = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#write
  inputSchema: z.object({
    /**
     * The absolute path to the file to write
     */
    file_path: z.string(),
    /**
     * The content to write to the file
     */
    content: z.string(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#write-2
  outputSchema: z.string(),
});

export type WriteUIToolInvocation = UIToolInvocation<typeof Write>;
