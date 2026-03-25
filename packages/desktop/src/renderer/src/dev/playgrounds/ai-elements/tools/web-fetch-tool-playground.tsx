import { useState } from "react";

import { WebFetchTool } from "../../../../features/agent/components/tool-parts/web-fetch-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available";

const inputAvailableInvocation = {
  type: "tool-WebFetch",
  toolCallId: "web-fetch-input-available",
  state: "input-available",
  input: {
    url: "https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-typescript",
    prompt: "Summarize the output shape used by Claude Code tools.",
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-WebFetch",
  toolCallId: "web-fetch-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output:
    "Claude Code tools arrive as typed UI invocations with `input`, `output`, `state`, and `toolCallId` fields.",
  providerExecuted: true,
} as any;

export function WebFetchToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="WebFetchTool"
      summary="The prompt and result sections can be inspected before or after the remote fetch completes."
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
      <WebFetchTool
        invocation={
          scenario === "input-available" ? inputAvailableInvocation : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
