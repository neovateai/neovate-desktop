"use client";

import { HelpCircle } from "lucide-react";

import type { AskUserQuestionUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

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

  const { state, output } = invocation;

  return (
    <Tool state={state} defaultOpen>
      <ToolHeader>
        <ToolHeaderIcon icon={HelpCircle} />
        Ask User Question
      </ToolHeader>
      <ToolContent>
        <ToolOutput output={output} />
      </ToolContent>
    </Tool>
  );
}
