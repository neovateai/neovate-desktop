import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

// Docs: https://code.claude.com/docs/en/agent-sdk/typescript#read-2
export const ReadOutputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    file: z.object({
      filePath: z.string(),
      content: z.string(),
      numLines: z.number(),
      startLine: z.number(),
      totalLines: z.number(),
    }),
  }),
  z.object({
    type: z.literal("image"),
    file: z.object({
      base64: z.string(),
      type: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
      originalSize: z.number(),
      dimensions: z
        .object({
          originalWidth: z.number().optional(),
          originalHeight: z.number().optional(),
          displayWidth: z.number().optional(),
          displayHeight: z.number().optional(),
        })
        .optional(),
    }),
  }),
  z.object({
    type: z.literal("notebook"),
    file: z.object({
      filePath: z.string(),
      cells: z.array(z.any()),
    }),
  }),
  z.object({
    type: z.literal("pdf"),
    file: z.object({
      filePath: z.string(),
      base64: z.string(),
      originalSize: z.number(),
    }),
  }),
  z.object({
    type: z.literal("parts"),
    file: z.object({
      filePath: z.string(),
      originalSize: z.number(),
      count: z.number(),
      outputDir: z.string(),
    }),
  }),
]);

export const Read = tool({
  // Docs: https://code.claude.com/docs/en/agent-sdk/typescript#read
  inputSchema: z.object({
    file_path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
    pages: z.string().optional(),
  }),
  outputSchema: ReadOutputSchema,
});

export type ReadUIToolInvocation = UIToolInvocation<typeof Read>;
