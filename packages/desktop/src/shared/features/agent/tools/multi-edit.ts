import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const MultiEdit = tool({
  inputSchema: z.object({
    file_path: z.string(),
    edits: z.array(
      z.object({
        old_string: z.string(),
        new_string: z.string(),
      }),
    ),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the MultiEdit tool. */
export type MultiEditUIToolInvocation = UIToolInvocation<typeof MultiEdit>;
