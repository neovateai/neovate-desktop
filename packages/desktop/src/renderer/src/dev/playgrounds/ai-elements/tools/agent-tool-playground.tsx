import { useState } from "react";

import { ClaudeCodeToolUIPart } from "../../../../features/agent/components/tool-parts";
import { AgentTool } from "../../../../features/agent/components/tool-parts/agent-tool";
import { PlaygroundPage, rendererRoot, ScenarioButton } from "../common";

type Scenario = "input-available" | "output-available" | "preliminary";

const outputMessage = {
  id: "agent-output-message",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: "agent-tool" },
  parts: [
    {
      type: "text",
      text: "The sub-agent found the renderer entry point.",
      state: "done",
    },
    {
      type: "tool-Read",
      toolCallId: "agent-read-tool",
      state: "output-available",
      input: {
        file_path: `${rendererRoot}/dev/playgrounds/ai-elements/index.tsx`,
        limit: 20,
      },
      output: `1→export default function AiElementsPlayground() {
2→  const [section, setSection] = useState<SectionId>("chat");
3→}`,
      providerExecuted: true,
    },
  ],
} as any;

const inputAvailableInvocation = {
  type: "tool-Agent",
  toolCallId: "agent-tool-input-available",
  state: "input-available",
  input: {
    description: "Inspect the playground shell",
    prompt: "Find where the AI Elements sidebar is defined.",
    subagent_type: "explorer",
  },
  providerExecuted: true,
} as any;

const outputAvailableInvocation = {
  type: "tool-Agent",
  toolCallId: "agent-tool-output-available",
  state: "output-available",
  input: inputAvailableInvocation.input,
  output: outputMessage,
  providerExecuted: true,
} as any;

const preliminaryInvocation = {
  type: "tool-Agent",
  toolCallId: "agent-tool-preliminary",
  state: "output-available",
  preliminary: true,
  input: inputAvailableInvocation.input,
  output: "The sub-agent has started reporting partial findings.",
  providerExecuted: true,
} as any;

export function AgentToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  let invocation = outputAvailableInvocation;
  if (scenario === "input-available") invocation = inputAvailableInvocation;
  if (scenario === "preliminary") invocation = preliminaryInvocation;

  return (
    <PlaygroundPage
      title="AgentTool"
      summary="Agent tool states, including nested child tool output and the preliminary running badge."
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
            active={scenario === "preliminary"}
            onClick={() => setScenario("preliminary")}
          >
            Preliminary
          </ScenarioButton>
        </>
      }
    >
      <AgentTool
        invocation={invocation}
        renderToolPart={(_message, part) => <ClaudeCodeToolUIPart part={part} />}
      />
    </PlaygroundPage>
  );
}
