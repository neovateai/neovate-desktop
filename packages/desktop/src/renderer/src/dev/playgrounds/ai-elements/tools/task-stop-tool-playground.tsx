import { useState } from "react";

import { TaskStopTool } from "../../../../features/agent/components/tool-parts/task-stop-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available";

const inputAvailableInvocation = {
  type: "tool-TaskStop",
  toolCallId: "task-stop-input-available",
  state: "input-available",
  input: {
    task_id: "task-42",
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-TaskStop",
  toolCallId: "task-stop-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: {
    success: true,
    message: "Task stopped.",
  },
  providerExecuted: true,
} as any;

export function TaskStopToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="TaskStopTool"
      summary="Task stop is intentionally small, but it still has a before/after lifecycle worth debugging."
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
        </>
      }
    >
      <TaskStopTool
        invocation={
          scenario === "input-available" ? inputAvailableInvocation : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
