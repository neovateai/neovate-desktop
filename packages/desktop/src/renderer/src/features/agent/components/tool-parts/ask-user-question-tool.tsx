"use client";

import type { AskUserQuestionUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { useState } from "react";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { RadioGroup, RadioGroupItem } from "../../../../components/ui/radio-group";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Button } from "../../../../components/ui/button";
import { useAgentStore } from "../../store";

type Props = {
  invocation: AskUserQuestionUIToolInvocation;
  sessionId?: string;
};

/**
 * Renders an interactive AskUserQuestion tool invocation card.
 *
 * When the tool is waiting for user input (input-available state),
 * displays interactive radio buttons or checkboxes for selection.
 * After user submits, shows the selected answer(s) and disables input.
 */
export function AskUserQuestionTool({ invocation, sessionId }: Props) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const questions = input?.questions ?? [];
  const isPending = state === "input-available";

  // Track selections for each question
  const [selections, setSelections] = useState<Record<number, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const addUserMessage = useAgentStore((s) => s.addUserMessage);

  const handleSingleSelect = (qIdx: number, value: string) => {
    if (submitted) return;
    setSelections((prev) => ({ ...prev, [qIdx]: value }));
  };

  const handleMultiSelect = (qIdx: number, label: string, checked: boolean) => {
    if (submitted) return;
    setSelections((prev) => {
      const current = (prev[qIdx] as string[]) ?? [];
      if (checked) {
        return { ...prev, [qIdx]: [...current, label] };
      }
      return { ...prev, [qIdx]: current.filter((l) => l !== label) };
    });
  };

  const handleSubmit = () => {
    if (!sessionId || submitted) return;

    setSubmitted(true);

    // Build answer object
    const answers: Record<string, string> = {};
    questions.forEach((q, qIdx) => {
      const answer = selections[qIdx];
      if (answer) {
        answers[q.header] = Array.isArray(answer) ? answer.join(", ") : answer;
      }
    });

    // Store the result in the tool part (this will be picked up by the SDK)
    // For now, just add as a user message
    const message = Object.entries(answers)
      .map(([header, value]) => `${header}: ${value}`)
      .join("\n");
    addUserMessage(sessionId, message);
  };

  const isComplete = questions.every((_, qIdx) => {
    const sel = selections[qIdx];
    if (Array.isArray(sel)) return sel.length > 0;
    return !!sel;
  });

  return (
    <Tool defaultOpen={true}>
      <ToolHeader title="Ask User Question" type="tool-AskUserQuestion" state={state} />
      <ToolContent>
        <div className="space-y-6">
          {questions.map((q, qIdx) => {
            const answer = selections[qIdx];
            const hasAnswer = !!answer && (Array.isArray(answer) ? answer.length > 0 : true);

            return (
              <div key={qIdx} className="space-y-3">
                {/* Question header and text */}
                <div className="space-y-1">
                  <h4 className="font-medium text-sm text-foreground">{q.header}</h4>
                  <p className="text-muted-foreground text-sm">{q.question}</p>
                </div>

                {/* Show selected answer if submitted */}
                {submitted && hasAnswer && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      已选择: {Array.isArray(answer) ? answer.join(", ") : answer}
                    </p>
                  </div>
                )}

                {/* Options - only interactive when pending and not submitted */}
                {(!submitted || !hasAnswer) && (
                  <div className="border-l-2 border-border pl-4 space-y-3">
                    {q.multiSelect ? (
                      // Multi-select with checkboxes
                      <div className="space-y-2">
                        {q.options.map((option) => {
                          const currentSel = (selections[qIdx] as string[]) ?? [];
                          const isChecked = currentSel.includes(option.label);
                          return (
                            <label
                              key={option.label}
                              className={`flex items-start gap-3 rounded p-1 -ml-1 ${
                                submitted
                                  ? "opacity-50 cursor-not-allowed"
                                  : "cursor-pointer hover:bg-muted/50"
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                disabled={submitted || !isPending}
                                onCheckedChange={(checked) =>
                                  handleMultiSelect(qIdx, option.label, checked as boolean)
                                }
                              />
                              <div className="space-y-0.5">
                                <span
                                  className={`text-sm font-medium ${
                                    isChecked ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {option.label}
                                </span>
                                <p className="text-muted-foreground text-xs">
                                  {option.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      // Single-select with radio buttons
                      <RadioGroup
                        value={(selections[qIdx] as string) ?? ""}
                        onValueChange={(value) => handleSingleSelect(qIdx, value)}
                        disabled={submitted || !isPending}
                      >
                        {q.options.map((option) => {
                          const isSelected = selections[qIdx] === option.label;
                          return (
                            <label
                              key={option.label}
                              className={`flex items-start gap-3 rounded p-1 -ml-1 ${
                                submitted
                                  ? "opacity-50 cursor-not-allowed"
                                  : "cursor-pointer hover:bg-muted/50"
                              }`}
                            >
                              <RadioGroupItem
                                value={option.label}
                                disabled={submitted || !isPending}
                              />
                              <div className="space-y-0.5">
                                <span
                                  className={`text-sm font-medium ${
                                    isSelected ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {option.label}
                                </span>
                                <p className="text-muted-foreground text-xs">
                                  {option.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    )}
                  </div>
                )}

                {/* Selection mode indicator */}
                {!submitted && (
                  <p className="text-muted-foreground text-xs">
                    {q.multiSelect ? "可选择多个选项" : "请选择一个选项"}
                  </p>
                )}
              </div>
            );
          })}

          {/* Submit button - only show when pending and not submitted */}
          {isPending && !submitted && (
            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" onClick={handleSubmit} disabled={!isComplete}>
                提交答案
              </Button>
            </div>
          )}
        </div>
      </ToolContent>
    </Tool>
  );
}
