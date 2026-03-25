import { useState } from "react";

import { SlashCommandTool } from "../../../../features/agent/components/tool-parts/slash-command-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "output-error";

const baseInput = {
  command: "/compact",
};

const inputAvailableInvocation = {
  type: "tool-SlashCommand",
  toolCallId: "slash-command-input-available",
  state: "input-available",
  input: baseInput,
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-SlashCommand",
  toolCallId: "slash-command-output-available",
  state: "output-available",
  input: baseInput,
  output: { text: "Compacted the current conversation context.", images: [] },
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-SlashCommand",
  toolCallId: "slash-command-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "Unknown slash command `/compact` in the current environment.",
  providerExecuted: true,
} as any;

export function SlashCommandToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "output-error") invocation = outputErrorInvocation;

  return (
    <PlaygroundPage
      title="SlashCommandTool"
      summary="Slash commands are now first-class playground entries instead of being invisible registry-only tools."
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
      <SlashCommandTool invocation={invocation} />
    </PlaygroundPage>
  );
}
