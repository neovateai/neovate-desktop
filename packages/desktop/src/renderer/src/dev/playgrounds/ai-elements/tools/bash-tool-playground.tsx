import { useState } from "react";

import { BashTool } from "../../../../features/agent/components/tool-parts/bash-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "approval-requested" | "output-available" | "output-error";

const baseInput = {
  command: "bun run --filter=neovate-desktop dev",
  description: "Start the desktop app in development mode",
};

const inputAvailableInvocation = {
  type: "tool-Bash",
  toolCallId: "bash-tool-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const approvalRequestedInvocation = {
  type: "tool-Bash",
  toolCallId: "bash-tool-approval-requested",
  state: "approval-requested",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Bash",
  toolCallId: "bash-tool-output-available",
  state: "output-available",
  input: baseInput,
  output: { text: "Starting development server...\n✓ Ready on http://localhost:5173", images: [] },
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-Bash",
  toolCallId: "bash-tool-output-error",
  state: "output-error",
  input: baseInput,
  output: { text: "error: port 5173 is already in use", images: [] },
  providerExecuted: true,
} as any;

export function BashToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "approval-requested") invocation = approvalRequestedInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="BashTool"
      summary="Shows pending, approval, success, and failure states for shell execution."
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
        </>
      }
    >
      <BashTool invocation={invocation} />
    </PlaygroundPage>
  );
}
