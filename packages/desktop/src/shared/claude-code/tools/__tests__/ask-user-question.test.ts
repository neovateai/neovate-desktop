import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AskUserQuestion } from "../ask-user-question";

describe("AskUserQuestion schema", () => {
  it("accepts preview fields on input and structured output", () => {
    const questions = [
      {
        question: "Which UI should we use?",
        header: "UI",
        options: [
          {
            label: "Compact",
            description: "A denser layout for power users.",
            preview: "<div>Compact preview</div>",
          },
          {
            label: "Comfortable",
            description: "A roomier layout with larger spacing.",
          },
        ],
        multiSelect: false,
      },
    ];

    const input = {
      questions,
      answers: { "Which UI should we use?": "Compact" },
    };

    const output = {
      questions,
      answers: { "Which UI should we use?": "Compact" },
    };

    const inputSchema = AskUserQuestion.inputSchema as z.ZodTypeAny;
    const outputSchema = AskUserQuestion.outputSchema as z.ZodTypeAny;

    const parsedInput = inputSchema.parse(input) as typeof input;
    const parsedOutput = outputSchema.parse(output) as typeof output;

    expect(parsedInput.questions[0]?.options[0]?.preview).toBe("<div>Compact preview</div>");
    expect(parsedOutput.answers["Which UI should we use?"]).toBe("Compact");
  });
});
