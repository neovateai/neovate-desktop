import { useState } from "react";

import { EditTool } from "../../../../features/agent/components/tool-parts/edit-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const baseInput = {
  file_path: `${rendererRoot}/dev/playgrounds/ai-elements/index.tsx`,
  old_string: 'const [section, setSection] = useState<SectionId>("chat");',
  new_string:
    'const [section, setSection] = useState<SectionId>("chat");\n  const [pinned, setPinned] = useState(false);',
};

const inputAvailableInvocation = {
  type: "tool-Edit",
  toolCallId: "edit-tool-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Edit",
  toolCallId: "edit-tool-output-available",
  state: "output-available",
  input: baseInput,
  output: "Applied 1 edit.",
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-Edit",
  toolCallId: "edit-tool-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Could not find the target snippet in the file.",
  providerExecuted: true,
} as any;

export function EditToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="EditTool"
      summary="Diff rendering stays visible before execution and when the edit fails."
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
      <EditTool invocation={invocation} />
    </PlaygroundPage>
  );
}
