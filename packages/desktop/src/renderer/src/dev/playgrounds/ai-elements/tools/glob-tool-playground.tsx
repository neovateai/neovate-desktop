import { useState } from "react";

import { GlobTool } from "../../../../features/agent/components/tool-parts/glob-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available";

const inputAvailableInvocation = {
  type: "tool-Glob",
  toolCallId: "glob-tool-input-available",
  state: "input-available",
  input: {
    pattern: "**/*tool*.tsx",
    path: `${rendererRoot}/features/agent/components/tool-parts`,
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Glob",
  toolCallId: "glob-tool-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: {
    text: `agent-tool.tsx
bash-tool.tsx
write-tool.tsx`,
    images: [],
  },
  providerExecuted: true,
} as any;

export function GlobToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="GlobTool"
      summary="Glob can be previewed before execution or after the file list is returned."
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
      <GlobTool
        invocation={
          scenario === "input-available" ? inputAvailableInvocation : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
