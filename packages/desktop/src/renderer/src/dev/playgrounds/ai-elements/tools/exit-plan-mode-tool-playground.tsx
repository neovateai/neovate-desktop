import { useState } from "react";

import { ExitPlanModeTool } from "../../../../features/agent/components/tool-parts/exit-plan-mode-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "approval-requested" | "output-available" | "output-denied" | "output-error";

const baseInput = {
  plan: `1. Split the playground into per-tool files
2. Add chat scenarios under AI Elements
3. Expose every tool state with local scenario toggles`,
};

const approvalRequestedInvocation = {
  type: "tool-ExitPlanMode",
  toolCallId: "exit-plan-mode-approval-requested",
  state: "approval-requested",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-ExitPlanMode",
  toolCallId: "exit-plan-mode-output-available",
  state: "output-available",
  input: baseInput,
  output: "Plan approved. Returning to implementation mode.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-ExitPlanMode",
  toolCallId: "exit-plan-mode-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Cannot exit: no active plan",
  providerExecuted: true,
} as any;

const outputDeniedInvocation = {
  type: "tool-ExitPlanMode",
  toolCallId: "exit-plan-mode-output-denied",
  state: "output-denied",
  input: baseInput,
  output: "Plan revision requested before leaving plan mode.",
  providerExecuted: true,
} as any;

export function ExitPlanModeToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "approval-requested") invocation = approvalRequestedInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;
  if (scenario === "output-denied") invocation = outputDeniedInvocation;

  return (
    <PlaygroundPage
      title="ExitPlanModeTool"
      summary="Plan approval can now be inspected before approval, after approval, and when it is denied."
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
      <ExitPlanModeTool invocation={invocation} />
    </PlaygroundPage>
  );
}
