import { useState } from "react";

import { TodoWriteTool } from "../../../../features/agent/components/tool-parts/todo-write-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const input = {
  todos: [
    {
      content: "Split the AI Elements playground into multiple files",
      status: "completed",
      activeForm: "Splitting the AI Elements playground into multiple files",
    },
    {
      content: "Add chat scenarios",
      status: "in_progress",
      activeForm: "Adding chat scenarios",
    },
    {
      content: "Update CONTRIBUTING.md",
      status: "pending",
      activeForm: "Updating CONTRIBUTING.md",
    },
  ],
};

const inputAvailableInvocation = {
  type: "tool-TodoWrite",
  toolCallId: "todo-write-input-available",
  state: "input-available",
  input,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-TodoWrite",
  toolCallId: "todo-write-output-available",
  state: "output-available",
  input,
  output: "Updated todo list.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-TodoWrite",
  toolCallId: "todo-write-output-error",
  state: "output-error",
  input,
  errorText: "Failed to update todo list: invalid task status",
  providerExecuted: true,
} as any;

export function TodoWriteToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="TodoWriteTool"
      summary="Todo states stay visible before and after execution because the renderer is driven by the input payload."
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
      <TodoWriteTool
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
