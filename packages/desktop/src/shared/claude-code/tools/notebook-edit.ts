import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const NotebookEdit = tool({
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#notebookedit
  inputSchema: z.object({
    /**
     * The absolute path to the Jupyter notebook file
     */
    notebook_path: z.string(),
    /**
     * The ID of the cell to edit
     */
    cell_id: z.string().optional(),
    /**
     * The new source for the cell
     */
    new_source: z.string(),
    /**
     * The type of the cell (code or markdown)
     */
    cell_type: z.enum(["code", "markdown"]).optional(),
    /**
     * The type of edit (replace, insert, delete)
     */
    edit_mode: z.enum(["replace", "insert", "delete"]).optional(),
  }),
  // Docs: https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript#notebookedit-2
  outputSchema: z.string(),
});

export type NotebookEditUIToolInvocation = UIToolInvocation<typeof NotebookEdit>;
