import { useState } from "react";

import { SkillTool } from "../../../../features/agent/components/tool-parts/skill-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available";

const inputAvailableInvocation = {
  type: "tool-Skill",
  toolCallId: "skill-tool-input-available",
  state: "input-available",
  input: {
    skill: "frontend-design",
    args: "Preserve the AI Elements chrome while expanding scenario coverage.",
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Skill",
  toolCallId: "skill-tool-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output:
    "Loaded /frontend-design. Keep the chrome consistent and make the scenario toggles feel native.",
  providerExecuted: true,
} as any;

export function SkillToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  return (
    <PlaygroundPage
      title="SkillTool"
      summary="Skill loading can be debugged before the tool resolves or after the guidance arrives."
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
      <SkillTool
        invocation={
          scenario === "input-available" ? inputAvailableInvocation : outputAvailableInvocation
        }
      />
    </PlaygroundPage>
  );
}
