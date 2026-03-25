import { useState } from "react";

import { ReadTool } from "../../../../features/agent/components/tool-parts/read-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "approval-requested" | "output-available" | "output-error";

const baseInput = {
  file_path: `${rendererRoot}/features/agent/components/message-parts.tsx`,
  offset: 1,
  limit: 12,
};

const inputAvailableInvocation = {
  type: "tool-Read",
  toolCallId: "read-tool-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const approvalRequestedInvocation = {
  type: "tool-Read",
  toolCallId: "read-tool-approval-requested",
  state: "approval-requested",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Read",
  toolCallId: "read-tool-output-available",
  state: "output-available",
  input: baseInput,
  output: {
    text: `1→import type { ReactNode } from "react";
2→
3→import { isToolUIPart, type ToolUIPart } from "ai";`,
    images: [],
  },
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-Read",
  toolCallId: "read-tool-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "File not found at the requested path.",
  providerExecuted: true,
} as any;

export function ReadToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "approval-requested") invocation = approvalRequestedInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="ReadTool"
      summary="Read now exposes pre-execution, approval, success, and failure states inside the same renderer."
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
      <ReadTool invocation={invocation} />
    </PlaygroundPage>
  );
}
