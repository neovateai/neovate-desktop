import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";

const QuestionSchema = z.object({
  question: z.string(),
  header: z.string(),
  options: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      preview: z.string().optional(),
    }),
  ),
  multiSelect: z.boolean(),
});

export const AskUserQuestionInputSchema = z.object({
  questions: z.array(QuestionSchema),
  answers: z.record(z.string(), z.string()).optional(),
});

export const AskUserQuestionOutputSchema = z.string();

export const AskUserQuestion = tool({
  inputSchema: AskUserQuestionInputSchema,
  outputSchema: AskUserQuestionOutputSchema,
});

/** Fully typed tool invocation for the AskUserQuestion tool. */
export type AskUserQuestionUIToolInvocation = UIToolInvocation<typeof AskUserQuestion>;
