import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

const QuestionSchema = z.object({
  question: z.string(),
  header: z.string(),
  options: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
    }),
  ),
  multiSelect: z.boolean(),
});

export const AskUserQuestion = tool({
  inputSchema: z.object({
    questions: z.array(QuestionSchema),
    answers: z.record(z.string(), z.string()).optional(),
  }),
  outputSchema: z.object({
    questions: z.array(QuestionSchema),
    answers: z.record(z.string(), z.string()),
  }),
});

/** Fully typed tool invocation for the AskUserQuestion tool. */
export type AskUserQuestionUIToolInvocation = UIToolInvocation<typeof AskUserQuestion>;
