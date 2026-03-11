"use client";

import type { AskUserQuestionUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";

type Props = {
  invocation: AskUserQuestionUIToolInvocation & { type: "tool-AskUserQuestion" };
};

export function AskUserQuestionTool({ invocation }: Props) {
  if (
    !invocation ||
    invocation.state === "input-streaming" ||
    invocation.state === "input-available" ||
    !invocation.output
  ) {
    return null;
  }

  const { state, output, type } = invocation;

  return (
    <Tool defaultOpen>
      <ToolHeader title="Ask User Question" type={type} state={state} />
      <ToolContent>
        <ToolOutput output={output} />
      </ToolContent>
    </Tool>
  );
}
