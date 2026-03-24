import { useState } from "react";

import { MultiEditTool } from "../../../../features/agent/components/tool-parts/multi-edit-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const baseInput = {
  file_path: `${rendererRoot}/dev/playgrounds/ai-elements/index.tsx`,
  edits: [
    {
      old_string: "SidebarGroupLabel>Tools</SidebarGroupLabel>",
      new_string: "SidebarGroupLabel>Tool Renderers</SidebarGroupLabel>",
    },
    {
      old_string: 'SidebarButton active={section === "chat"}',
      new_string: 'SidebarButton active={section === "chat"} data-current-chat',
    },
  ],
};

const inputAvailableInvocation = {
  type: "tool-MultiEdit",
  toolCallId: "multi-edit-tool-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-MultiEdit",
  toolCallId: "multi-edit-tool-output-available",
  state: "output-available",
  input: baseInput,
  output: "Applied 2 edits.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-MultiEdit",
  toolCallId: "multi-edit-tool-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Second edit could not be applied because the file changed.",
  providerExecuted: true,
} as any;

export function MultiEditToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="MultiEditTool"
      summary="Each edit remains visible even when the provider has not finished yet."
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
      <MultiEditTool invocation={invocation} />
    </PlaygroundPage>
  );
}
