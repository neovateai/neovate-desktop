import { useState } from "react";

import { GrepTool } from "../../../../features/agent/components/tool-parts/grep-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const inputAvailableInvocation = {
  type: "tool-Grep",
  toolCallId: "grep-tool-input-available",
  state: "input-available",
  input: {
    pattern: "ToolHeader",
    path: `${rendererRoot}/features/agent/components/tool-parts`,
    "-n": true,
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Grep",
  toolCallId: "grep-tool-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: `read-tool.tsx:21:      <ToolHeader type="tool-Read" state={state} title={title} />
write-tool.tsx:20:      <ToolHeader type="tool-Write" state={state} title={title} />`,
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-Grep",
  toolCallId: "grep-tool-output-error",
  state: "output-error",
  input: inputAvailableInvocation.input,
  errorText: "Invalid regex pattern: unmatched parenthesis",
  providerExecuted: true,
} as any;

export function GrepToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="GrepTool"
      summary="Grep shows the same shell-style output block in both standalone and chat-driven flows."
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
      <GrepTool
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
