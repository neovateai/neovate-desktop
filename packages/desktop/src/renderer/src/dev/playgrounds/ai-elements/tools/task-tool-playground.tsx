import { useState } from "react";

import { AgentTool } from "../../../../features/agent/components/tool-parts/agent-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const inputAvailableInvocation = {
  type: "tool-Task",
  toolCallId: "task-tool-input-available",
  state: "input-available",
  input: {
    description: "Review remaining UI states",
    prompt: "List which tool playgrounds still need approval-state coverage.",
    subagent_type: "explorer",
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Task",
  toolCallId: "task-tool-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: [
    {
      type: "text",
      text: "Approval-requested states were added to AskUserQuestionTool and ExitPlanModeTool.",
    },
    {
      type: "text",
      text: "The remaining work is wiring every tool into the new sidebar.",
    },
  ],
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-Task",
  toolCallId: "task-tool-output-error",
  state: "output-error",
  input: inputAvailableInvocation.input,
  errorText: "Agent failed to start: invalid subagent type",
  providerExecuted: true,
} as any;

export function TaskToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="TaskTool"
      summary="Task is an alias of Agent, but it still needs its own isolated playground entry."
      scenarioLabel={scenario}
      controls={
        <>
          <ScenarioButton
            active={scenario === "input-available"}
            onClick={() => setScenario("input-available")}
          >
            Input Available
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
        </>
      }
    >
      <AgentTool
        invocation={
          scenario === "output-error"
            ? outputErrorInvocation
            : scenario === "input-available"
              ? inputAvailableInvocation
              : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
