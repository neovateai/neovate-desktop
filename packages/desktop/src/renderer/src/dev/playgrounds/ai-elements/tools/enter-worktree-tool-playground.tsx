import { useState } from "react";

import { EnterWorktreeTool } from "../../../../features/agent/components/tool-parts/enter-worktree-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const baseInput = {
  name: "feat-playground-state-debugging",
};

const inputAvailableInvocation = {
  type: "tool-EnterWorktree",
  toolCallId: "enter-worktree-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-EnterWorktree",
  toolCallId: "enter-worktree-output-available",
  state: "output-available",
  input: baseInput,
  output: "Created .worktrees/feat-playground-state-debugging and switched the task into it.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-EnterWorktree",
  toolCallId: "enter-worktree-output-error",
  state: "output-error",
  input: baseInput,
  output: "A worktree with that name already exists.",
  providerExecuted: true,
} as any;

export function EnterWorktreeToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="EnterWorktreeTool"
      summary="Shows the pending message before worktree creation and the result after it resolves."
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
      <EnterWorktreeTool invocation={invocation} />
    </PlaygroundPage>
  );
}
