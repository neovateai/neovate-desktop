import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

export const Edit = tool({
  inputSchema: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  }),
  outputSchema: z.string(),
});

/** Fully typed tool invocation for the Edit tool. */
export type EditUIToolInvocation = UIToolInvocation<typeof Edit>;
