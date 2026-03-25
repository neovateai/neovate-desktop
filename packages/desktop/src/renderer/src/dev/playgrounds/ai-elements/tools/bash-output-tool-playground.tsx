import { useState } from "react";

import { BashOutputTool } from "../../../../features/agent/components/tool-parts/bash-output-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available";

const inputAvailableInvocation = {
  type: "tool-BashOutput",
  toolCallId: "bash-output-tool-input-available",
  state: "input-available",
  input: {
    bash_id: "shell-42",
    filter: "ERROR|WARN",
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-BashOutput",
  toolCallId: "bash-output-tool-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: { text: "WARN retrying request\nERROR registry timed out", images: [] },
  providerExecuted: true,
} as any;

export function BashOutputToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="BashOutputTool"
      summary="Background shell polling is now debuggable as a first-class tool renderer."
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
      <BashOutputTool
        invocation={
          scenario === "input-available" ? inputAvailableInvocation : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
