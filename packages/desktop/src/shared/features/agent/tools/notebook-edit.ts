import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const NotebookEdit = tool({
  inputSchema: z.object({
    notebook_path: z.string(),
    new_source: z.string(),
    cell_number: z.number().optional(),
    cell_type: z.enum(["code", "markdown"]).optional(),
    edit_mode: z.enum(["insert", "replace", "delete"]).optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the NotebookEdit tool. */
export type NotebookEditUIToolInvocation = UIToolInvocation<typeof NotebookEdit>;
