"use client";

import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

import { useState } from "react";

import { AskUserQuestionInputSchema } from "../../../../../shared/claude-code/tools/ask-user-question";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Label } from "../../../components/ui/label";
import { Radio, RadioGroup } from "../../../components/ui/radio-group";

type Props = {
  input: z.infer<typeof AskUserQuestionInputSchema>;
  onResolve: (result: PermissionResult) => void;
};

const CUSTOM_ANSWER_OPTION = "__custom_answer__";

export function AskUserQuestionRequestDialog({ input, onResolve }: Props) {
  const [selections, setSelections] = useState<Record<number, string | string[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  const autoResizeTextarea = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  const getQuestionAnswer = (questionIndex: number) => {
    const selection = selections[questionIndex];
    const customAnswer = customAnswers[questionIndex]?.trim();

    if (Array.isArray(selection)) {
      const selectedOptions = selection.filter((item) => item !== CUSTOM_ANSWER_OPTION);
      const includeCustomAnswer =
        selection.includes(CUSTOM_ANSWER_OPTION) && customAnswer ? [customAnswer] : [];
      const combined = [...selectedOptions, ...includeCustomAnswer].join(", ");
      return combined || null;
    }

    if (selection === CUSTOM_ANSWER_OPTION) {
      return customAnswer || null;
    }

    return selection || null;
  };

  const handleSingleSelect = (qIdx: number, value: string) => {
    setSelections((prev) => ({ ...prev, [qIdx]: value }));
  };

  const handleMultiSelect = (qIdx: number, label: string, checked: boolean) => {
    setSelections((prev) => {
      const current = (prev[qIdx] as string[]) ?? [];
      return checked
        ? { ...prev, [qIdx]: [...current, label] }
        : { ...prev, [qIdx]: current.filter((item) => item !== label) };
    });
  };

  const selectCustomAnswerOption = (questionIndex: number, multiSelect: boolean) => {
    if (multiSelect) {
      setSelections((prev) => {
        const current = (prev[questionIndex] as string[]) ?? [];
        if (current.includes(CUSTOM_ANSWER_OPTION)) {
          return prev;
        }
        return {
          ...prev,
          [questionIndex]: [...current, CUSTOM_ANSWER_OPTION],
        };
      });
      return;
    }

    setSelections((prev) => ({
      ...prev,
      [questionIndex]: CUSTOM_ANSWER_OPTION,
    }));
  };

  const activeQuestion = input.questions[activeQuestionIndex];
  const activeSelection = selections[activeQuestionIndex];
  const activeSelectedLabels = Array.isArray(activeSelection)
    ? activeSelection
    : activeSelection
      ? [activeSelection]
      : [];
  const customAnswerValue = customAnswers[activeQuestionIndex] ?? "";
  const customAnswerSelected = activeQuestion.multiSelect
    ? activeSelectedLabels.includes(CUSTOM_ANSWER_OPTION)
    : activeSelection === CUSTOM_ANSWER_OPTION;
  const selectedPreview = activeQuestion?.options.find(
    (option) => option.preview && activeSelectedLabels.includes(option.label),
  )?.preview;
  const isLastQuestion = activeQuestionIndex === input.questions.length - 1;

  return (
    <div className="relative rounded-xl border border-border/80 bg-white px-4 py-2">
      {activeQuestion && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {activeQuestionIndex + 1} of {input.questions.length} questions
                </p>
              </div>
              <div className="flex items-center gap-2">
                {input.questions.map((question, index) => {
                  const isAnswered = !!getQuestionAnswer(index);
                  const isActive = index === activeQuestionIndex;

                  return (
                    <button
                      key={`${question.header}-${index}`}
                      onClick={() => setActiveQuestionIndex(index)}
                      className={`h-1.5 rounded-full transition-all ${
                        isActive
                          ? "w-6 bg-foreground"
                          : isAnswered
                            ? "w-4 bg-foreground/45"
                            : "w-4 bg-border"
                      }`}
                      aria-label={`Go to question ${index + 1}`}
                      type="button"
                    >
                      <span className="sr-only">{question.header}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-lg font-semibold text-foreground">
                {activeQuestion.question}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeQuestion.multiSelect ? "Select all answers that apply" : "Select one answer"}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            {activeQuestion.multiSelect ? (
              <div className="space-y-1">
                {activeQuestion.options.map((option) => {
                  const current = (selections[activeQuestionIndex] as string[]) ?? [];

                  return (
                    <Label
                      key={option.label}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-3 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50"
                    >
                      <Checkbox
                        checked={current.includes(option.label)}
                        onCheckedChange={(value) =>
                          handleMultiSelect(activeQuestionIndex, option.label, value as boolean)
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <p className="text-sm text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </Label>
                  );
                })}
                <Label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-3 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50">
                  <Checkbox
                    checked={customAnswerSelected}
                    onCheckedChange={(value) => {
                      handleMultiSelect(
                        activeQuestionIndex,
                        CUSTOM_ANSWER_OPTION,
                        value as boolean,
                      );
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-foreground">Type your own answer</p>
                    </div>
                    <textarea
                      placeholder="Type your answer..."
                      rows={1}
                      style={{ resize: "none" }}
                      className="mt-2 block w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                      value={customAnswerValue}
                      ref={autoResizeTextarea}
                      onChange={(event) => {
                        selectCustomAnswerOption(activeQuestionIndex, activeQuestion.multiSelect);
                        autoResizeTextarea(event.currentTarget);
                        setCustomAnswers((prev) => ({
                          ...prev,
                          [activeQuestionIndex]: event.target.value,
                        }));
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectCustomAnswerOption(activeQuestionIndex, activeQuestion.multiSelect);
                      }}
                    />
                  </div>
                </Label>
              </div>
            ) : (
              <RadioGroup
                value={(selections[activeQuestionIndex] as string) ?? ""}
                onValueChange={(value) => handleSingleSelect(activeQuestionIndex, value)}
                className="gap-1"
              >
                {activeQuestion.options.map((option) => {
                  return (
                    <Label
                      key={option.label}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-3 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50"
                    >
                      <Radio value={option.label} />
                      <div className="flex flex-col gap-1">
                        <p className="text-sm text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </Label>
                  );
                })}
                <Label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-3 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50">
                  <Radio value={CUSTOM_ANSWER_OPTION} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-foreground">Type your own answer</p>
                    </div>
                    <textarea
                      placeholder="Type your answer..."
                      rows={1}
                      style={{ resize: "none" }}
                      className="mt-2 block w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                      value={customAnswerValue}
                      ref={autoResizeTextarea}
                      onChange={(event) => {
                        selectCustomAnswerOption(activeQuestionIndex, activeQuestion.multiSelect);
                        autoResizeTextarea(event.currentTarget);
                        setCustomAnswers((prev) => ({
                          ...prev,
                          [activeQuestionIndex]: event.target.value,
                        }));
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectCustomAnswerOption(activeQuestionIndex, activeQuestion.multiSelect);
                      }}
                    />
                  </div>
                </Label>
              </RadioGroup>
            )}
          </div>
        </div>
      )}

      {selectedPreview && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="mb-2 text-xs font-medium text-foreground">Preview</p>
          <pre className="overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {selectedPreview}
          </pre>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 bg-muted/10">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onResolve({
              behavior: "deny",
              message: "User cancelled ask user question",
            })
          }
        >
          Dismiss
        </Button>
        <div className="flex items-center gap-2">
          {activeQuestionIndex > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveQuestionIndex((current) => Math.max(0, current - 1))}
            >
              Back
            </Button>
          )}
          {!isLastQuestion ? (
            <Button
              size="sm"
              onClick={() =>
                setActiveQuestionIndex((current) =>
                  Math.min(input.questions.length - 1, current + 1),
                )
              }
              variant="outline"
            >
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                const answers = Object.fromEntries(
                  input.questions.flatMap((question, qIdx) => {
                    const answer = getQuestionAnswer(qIdx);
                    if (!answer) return [];
                    return [[question.question, answer] as const];
                  }),
                );

                onResolve({
                  behavior: "allow",
                  updatedInput: {
                    ...input,
                    answers,
                  },
                });
              }}
              disabled={!isLastQuestion}
            >
              Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
