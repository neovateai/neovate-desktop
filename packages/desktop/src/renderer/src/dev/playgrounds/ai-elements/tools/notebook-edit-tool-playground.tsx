import { useState } from "react";

import { NotebookEditTool } from "../../../../features/agent/components/tool-parts/notebook-edit-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const baseInput = {
  notebook_path: "/tmp/playground-analysis.ipynb",
  cell_id: "cell-4",
  cell_type: "code",
  edit_mode: "replace",
  new_source: "tool_count = 22\nprint(f'{tool_count} playground entries loaded')",
};

const inputAvailableInvocation = {
  type: "tool-NotebookEdit",
  toolCallId: "notebook-edit-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-NotebookEdit",
  toolCallId: "notebook-edit-output-available",
  state: "output-available",
  input: baseInput,
  output: "Notebook cell updated.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-NotebookEdit",
  toolCallId: "notebook-edit-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Notebook cell cell-4 could not be found.",
  providerExecuted: true,
} as any;

export function NotebookEditToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="NotebookEditTool"
      summary="Notebook edits now have isolated before, after, and failure scenarios."
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
      <NotebookEditTool invocation={invocation} />
    </PlaygroundPage>
  );
}
