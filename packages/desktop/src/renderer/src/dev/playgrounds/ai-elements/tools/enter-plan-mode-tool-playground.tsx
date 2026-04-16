import { useState } from "react";

import { EnterPlanModeTool } from "../../../../features/agent/components/tool-parts/enter-plan-mode-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

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

const outputErrorInvocation = {
  type: "tool-EnterPlanMode",
  toolCallId: "enter-plan-mode-output-error",
  state: "output-error",
  input: inputAvailableInvocation.input,
  errorText: "Already in plan mode",
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
          <ScenarioButton
            active={scenario === "output-error"}
            onClick={() => setScenario("output-error")}
          >
            Output Error
          </ScenarioButton>
        </>
      }
    >
      <EnterPlanModeTool
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
