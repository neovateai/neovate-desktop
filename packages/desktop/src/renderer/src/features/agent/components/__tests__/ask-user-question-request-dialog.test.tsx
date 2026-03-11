// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AskUserQuestionRequestDialog } from "../ask-user-question-request-dialog";

afterEach(() => {
  cleanup();
});

describe("AskUserQuestionRequestDialog", () => {
  it("shows custom answer as an option and only submits on the last question", () => {
    const onResolve = vi.fn();

    render(
      <AskUserQuestionRequestDialog
        input={{
          questions: [
            {
              question: "First question",
              header: "First",
              options: [
                { label: "Alpha", description: "Option alpha" },
                { label: "Beta", description: "Option beta" },
              ],
              multiSelect: false,
            },
            {
              question: "Second question",
              header: "Second",
              options: [
                { label: "Gamma", description: "Option gamma" },
                { label: "Delta", description: "Option delta" },
              ],
              multiSelect: false,
            },
          ],
        }}
        onResolve={onResolve}
      />,
    );

    expect(screen.getByText("Type your own answer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(
      screen.queryByText("Enter a custom response instead of choosing only predefined options."),
    ).toBeNull();

    fireEvent.click(screen.getByText("Type your own answer"));
    expect(screen.queryByText("Your custom answer")).toBeNull();
    const firstCustomAnswer = screen.getByPlaceholderText(
      "Type your answer...",
    ) as HTMLTextAreaElement;
    expect(firstCustomAnswer.getAttribute("rows")).toBe("1");
    expect(firstCustomAnswer.style.resize).toBe("none");
    Object.defineProperty(firstCustomAnswer, "scrollHeight", {
      configurable: true,
      value: 68,
    });
    fireEvent.change(screen.getByPlaceholderText("Type your answer..."), {
      target: { value: "Custom first answer" },
    });
    expect(firstCustomAnswer.style.height).toBe("68px");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Second question")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByText("Gamma"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onResolve).toHaveBeenCalledWith({
      behavior: "allow",
      updatedInput: {
        questions: [
          {
            question: "First question",
            header: "First",
            options: [
              { label: "Alpha", description: "Option alpha" },
              { label: "Beta", description: "Option beta" },
            ],
            multiSelect: false,
          },
          {
            question: "Second question",
            header: "Second",
            options: [
              { label: "Gamma", description: "Option gamma" },
              { label: "Delta", description: "Option delta" },
            ],
            multiSelect: false,
          },
        ],
        answers: {
          "First question": "Custom first answer",
          "Second question": "Gamma",
        },
      },
    });
  });

  it("keeps the custom answer input visible when text already exists", () => {
    render(
      <AskUserQuestionRequestDialog
        input={{
          questions: [
            {
              question: "Only question",
              header: "Only",
              options: [
                { label: "Alpha", description: "Option alpha" },
                { label: "Beta", description: "Option beta" },
              ],
              multiSelect: false,
            },
          ],
        }}
        onResolve={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Type your own answer"));
    expect(screen.queryByText("Your custom answer")).toBeNull();
    const savedCustomAnswer = screen.getByPlaceholderText(
      "Type your answer...",
    ) as HTMLTextAreaElement;
    expect(savedCustomAnswer.getAttribute("rows")).toBe("1");
    expect(savedCustomAnswer.style.resize).toBe("none");
    Object.defineProperty(savedCustomAnswer, "scrollHeight", {
      configurable: true,
      value: 52,
    });
    fireEvent.change(screen.getByPlaceholderText("Type your answer..."), {
      target: { value: "Saved custom answer" },
    });
    expect(savedCustomAnswer.style.height).toBe("52px");
    fireEvent.click(screen.getByText("Alpha"));

    expect(screen.getByDisplayValue("Saved custom answer")).toBeTruthy();
  });

  it("allows submit on the last question without answering every question", () => {
    const onResolve = vi.fn();

    render(
      <AskUserQuestionRequestDialog
        input={{
          questions: [
            {
              question: "First question",
              header: "First",
              options: [
                { label: "Alpha", description: "Option alpha" },
                { label: "Beta", description: "Option beta" },
              ],
              multiSelect: false,
            },
            {
              question: "Second question",
              header: "Second",
              options: [
                { label: "Gamma", description: "Option gamma" },
                { label: "Delta", description: "Option delta" },
              ],
              multiSelect: false,
            },
          ],
        }}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Submit" })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onResolve).toHaveBeenCalledWith({
      behavior: "allow",
      updatedInput: {
        questions: [
          {
            question: "First question",
            header: "First",
            options: [
              { label: "Alpha", description: "Option alpha" },
              { label: "Beta", description: "Option beta" },
            ],
            multiSelect: false,
          },
          {
            question: "Second question",
            header: "Second",
            options: [
              { label: "Gamma", description: "Option gamma" },
              { label: "Delta", description: "Option delta" },
            ],
            multiSelect: false,
          },
        ],
        answers: {},
      },
    });
  });

  it("selects the custom option when the custom input is focused directly", () => {
    const onResolve = vi.fn();

    render(
      <AskUserQuestionRequestDialog
        input={{
          questions: [
            {
              question: "Only question",
              header: "Only",
              options: [
                { label: "Alpha", description: "Option alpha" },
                { label: "Beta", description: "Option beta" },
              ],
              multiSelect: false,
            },
          ],
        }}
        onResolve={onResolve}
      />,
    );

    const customInput = screen.getByPlaceholderText("Type your answer...");
    Object.defineProperty(customInput, "scrollHeight", {
      configurable: true,
      value: 44,
    });

    fireEvent.click(customInput);
    fireEvent.change(customInput, {
      target: { value: "Focused custom answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onResolve).toHaveBeenCalledWith({
      behavior: "allow",
      updatedInput: {
        questions: [
          {
            question: "Only question",
            header: "Only",
            options: [
              { label: "Alpha", description: "Option alpha" },
              { label: "Beta", description: "Option beta" },
            ],
            multiSelect: false,
          },
        ],
        answers: {
          "Only question": "Focused custom answer",
        },
      },
    });
  });

  it("does not keep using the custom answer after another option is selected", () => {
    const onResolve = vi.fn();

    render(
      <AskUserQuestionRequestDialog
        input={{
          questions: [
            {
              question: "Only question",
              header: "Only",
              options: [
                { label: "Alpha", description: "Option alpha" },
                { label: "Beta", description: "Option beta" },
              ],
              multiSelect: false,
            },
          ],
        }}
        onResolve={onResolve}
      />,
    );

    const customInput = screen.getByPlaceholderText("Type your answer...");
    Object.defineProperty(customInput, "scrollHeight", {
      configurable: true,
      value: 44,
    });

    fireEvent.change(customInput, {
      target: { value: "Focused custom answer" },
    });
    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onResolve).toHaveBeenCalledWith({
      behavior: "allow",
      updatedInput: {
        questions: [
          {
            question: "Only question",
            header: "Only",
            options: [
              { label: "Alpha", description: "Option alpha" },
              { label: "Beta", description: "Option beta" },
            ],
            multiSelect: false,
          },
        ],
        answers: {
          "Only question": "Alpha",
        },
      },
    });
  });
});
