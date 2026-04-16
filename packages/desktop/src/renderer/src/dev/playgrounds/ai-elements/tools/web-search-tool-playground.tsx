import { useState } from "react";

import { WebSearchTool } from "../../../../features/agent/components/tool-parts/web-search-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const inputAvailableInvocation = {
  type: "tool-WebSearch",
  toolCallId: "web-search-input-available",
  state: "input-available",
  input: {
    query: "Claude Code tool state examples",
    allowed_domains: ["docs.anthropic.com"],
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-WebSearch",
  toolCallId: "web-search-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: "Found official Claude Code docs covering tool inputs, outputs, and approval states.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-WebSearch",
  toolCallId: "web-search-output-error",
  state: "output-error",
  input: inputAvailableInvocation.input,
  errorText: "Search request failed: rate limit exceeded",
  providerExecuted: true,
} as any;

export function WebSearchToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="WebSearchTool"
      summary="Search results are now inspectable independently of the chat stream."
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
      <WebSearchTool
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
