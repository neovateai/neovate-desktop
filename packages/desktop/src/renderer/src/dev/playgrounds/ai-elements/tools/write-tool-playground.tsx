import { useState } from "react";

import { WriteTool } from "../../../../features/agent/components/tool-parts/write-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "approval-requested" | "output-available" | "output-error";

const baseInput = {
  file_path: `${rendererRoot}/dev/playgrounds/ai-elements/common.tsx`,
  content: `export const rendererRoot = "/Users/dinq/GitHub/neovateai/neovate-desktop/packages/desktop/src/renderer/src";`,
};

const inputAvailableInvocation = {
  type: "tool-Write",
  toolCallId: "write-tool-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const approvalRequestedInvocation = {
  type: "tool-Write",
  toolCallId: "write-tool-approval-requested",
  state: "approval-requested",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Write",
  toolCallId: "write-tool-output-available",
  state: "output-available",
  input: baseInput,
  output: "Wrote 1 file.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-Write",
  toolCallId: "write-tool-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Permission denied while creating the file.",
  providerExecuted: true,
} as any;

export function WriteToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "approval-requested") invocation = approvalRequestedInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="WriteTool"
      summary="Write now supports isolated debugging across pending, approval, success, and failure states."
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
      <WriteTool invocation={invocation} />
    </PlaygroundPage>
  );
}
