import { useState } from "react";

import { TaskOutputTool } from "../../../../features/agent/components/tool-parts/task-output-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const inputAvailableInvocation = {
  type: "tool-TaskOutput",
  toolCallId: "task-output-input-available",
  state: "input-available",
  input: {
    task_id: "task-42",
    block: true,
    timeout: 30000,
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-TaskOutput",
  toolCallId: "task-output-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: `{
  "status": "completed",
  "output": "Generated isolated playground scenarios for every tool renderer."
}`,
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-TaskOutput",
  toolCallId: "task-output-output-error",
  state: "output-error",
  input: inputAvailableInvocation.input,
  errorText: "Task not found: task-42",
  providerExecuted: true,
} as any;

export function TaskOutputToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="TaskOutputTool"
      summary="Task output now exposes its polling state before the payload arrives."
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
      <TaskOutputTool
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
