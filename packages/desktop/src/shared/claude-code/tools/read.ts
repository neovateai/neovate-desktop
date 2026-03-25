import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

const readOutputSchema = z.object({
  text: z.string(),
  images: z.array(
    z.object({
      url: z.string(),
      mediaType: z.string(),
      filename: z.string().optional(),
    }),
  ),
});

export const Read = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#read
  inputSchema: z.object({
    /**
     * The absolute path to the file to read
     */
    file_path: z.string(),
    /**
     * The line number to start reading from
     */
    offset: z.number().optional(),
    /**
     * The number of lines to read
     */
    limit: z.number().optional(),
  }),
  outputSchema: readOutputSchema,
});

export type ReadUIToolInvocation = UIToolInvocation<typeof Read>;
