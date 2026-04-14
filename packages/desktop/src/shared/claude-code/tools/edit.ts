import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

const StructuredPatchHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(z.string()),
});

const GitDiffSchema = z.object({
  filename: z.string(),
  status: z.enum(["modified", "added"]),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  patch: z.string(),
});

export const EditOutputSchema = z.object({
  filePath: z.string(),
  oldString: z.string(),
  newString: z.string(),
  originalFile: z.string(),
  structuredPatch: z.array(StructuredPatchHunkSchema),
  userModified: z.boolean(),
  replaceAll: z.boolean(),
  gitDiff: GitDiffSchema.optional(),
});

export const Edit = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#edit
  inputSchema: z.object({
    /**
     * The absolute path to the file to modify
     */
    file_path: z.string(),
    /**
     * The text to replace
     */
    old_string: z.string(),
    /**
     * The text to replace it with (must be different from old_string)
     */
    new_string: z.string(),
    /**
     * Replace all occurrences of old_string (default false)
     */
    replace_all: z.boolean().optional(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#edit-2
  outputSchema: EditOutputSchema,
});

export type EditUIToolInvocation = UIToolInvocation<typeof Edit>;
