import { useState } from "react";

import { EnterPlanModeTool } from "../../../../features/agent/components/tool-parts/enter-plan-mode-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available";

const inputAvailableInvocation = {
  type: "tool-EnterPlanMode",
  toolCallId: "enter-plan-mode-input-available",
  state: "input-available",
  input: {},
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-EnterPlanMode",
  toolCallId: "enter-plan-mode-output-available",
  state: "output-available",
  input: {},
  output: "Entered plan mode.",
  providerExecuted: true,
} as any;

export function EnterPlanModeToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="EnterPlanModeTool"
      summary="Plan-mode entry is a simple renderer, but it still needs pre- and post-execution states."
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
      <EnterPlanModeTool
        invocation={
          scenario === "input-available" ? inputAvailableInvocation : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
