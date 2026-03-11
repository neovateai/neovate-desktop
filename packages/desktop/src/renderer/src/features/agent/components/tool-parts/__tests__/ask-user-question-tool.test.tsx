// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AskUserQuestionTool } from "../ask-user-question-tool";

afterEach(() => {
  cleanup();
});

describe("AskUserQuestionTool", () => {
  it("renders output answers only", () => {
    render(
      <AskUserQuestionTool
        invocation={
          {
            type: "tool-AskUserQuestion",
            toolCallId: "tool-1",
            state: "output-available",
            input: {
              questions: [
                {
                  header: "JavaScript",
                  question: "What does var do?",
                  options: [
                    { label: "Function scope", description: "A" },
                    { label: "Block scope", description: "B" },
                  ],
                  multiSelect: false,
                },
              ],
            },
            output: "What does var do?: Function scope",
          } as never
        }
      />,
    );

    expect(screen.getByText("Ask User Question")).toBeTruthy();
    expect(screen.getByText("What does var do?: Function scope")).toBeTruthy();
    expect(screen.queryByText("Block scope")).toBeNull();
  });

  it("renders nothing when there is no output to show", () => {
    const { container } = render(
      <AskUserQuestionTool
        invocation={
          {
            type: "tool-AskUserQuestion",
            toolCallId: "tool-2",
            state: "output-available",
            input: {
              questions: [],
            },
          } as never
        }
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
