import { useState } from "react";

import { AskUserQuestionTool } from "../../../../features/agent/components/tool-parts/ask-user-question-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "approval-requested" | "output-available" | "output-denied" | "output-error";

const baseInput = {
  questions: [
    {
      header: "Coverage",
      question: "Which state should the playground prioritize next?",
      options: [
        {
          label: "Approval Requested",
          description: "Focus on pre-execution permission prompts.",
        },
        {
          label: "Output Error",
          description: "Focus on failed provider executions.",
        },
      ],
      multiSelect: false,
    },
  ],
};

const approvalRequestedInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "ask-user-question-approval-requested",
  state: "approval-requested",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "ask-user-question-output-available",
  state: "output-available",
  input: baseInput,
  output: "Selection recorded: Approval Requested.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "ask-user-question-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Question prompt timed out",
  providerExecuted: true,
} as any;

const outputDeniedInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "ask-user-question-output-denied",
  state: "output-denied",
  input: baseInput,
  output: "The user dismissed the prompt without answering.",
  providerExecuted: true,
} as any;

export function AskUserQuestionToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "approval-requested") invocation = approvalRequestedInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;
  if (scenario === "output-denied") invocation = outputDeniedInvocation;

  return (
    <PlaygroundPage
      title="AskUserQuestionTool"
      summary="Question prompts can now be inspected before and after the user responds."
      scenarioLabel={scenario}
      controls={
        <>
          <ScenarioButton
            active={scenario === "approval-requested"}
            onClick={() => setScenario("approval-requested")}
          >
            Approval Requested
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "output-available"}
            onClick={() => setScenario("output-available")}
          >
            Output Available
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "output-error"}
            onClick={() => setScenario("output-error")}
          >
            Output Error
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "output-denied"}
            onClick={() => setScenario("output-denied")}
          >
            Output Denied
          </ScenarioButton>
        </>
      }
    >
      <AskUserQuestionTool invocation={invocation} />
    </PlaygroundPage>
  );
}
