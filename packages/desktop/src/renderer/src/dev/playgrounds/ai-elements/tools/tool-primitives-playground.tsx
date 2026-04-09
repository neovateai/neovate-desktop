import { Blocks } from "lucide-react";
import { useState } from "react";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "output-error-no-text";

export function ToolPrimitivesPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  const isError = scenario === "output-error" || scenario === "output-error-no-text";
  const errorText =
    scenario === "output-error"
      ? "Something went wrong while executing the tool.\nPlease try again."
      : undefined;
  const state = isError ? "output-error" : scenario;

  return (
    <PlaygroundPage
      title="Tool Primitives"
      summary="Generic composable Tool components — Tool, ToolHeader, ToolHeaderIcon, ToolContent. Shows state-driven styling and unified error UI."
      scenarioLabel={scenario}
      controls={
        <>
          <ScenarioButton
            active={scenario === "input-streaming"}
            onClick={() => setScenario("input-streaming")}
          >
            Input Streaming
          </ScenarioButton>
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
          <ScenarioButton
            active={scenario === "output-error-no-text"}
            onClick={() => setScenario("output-error-no-text")}
          >
            Error (no text)
          </ScenarioButton>
        </>
      }
    >
      <Tool state={state} errorText={errorText}>
        <ToolHeader>
          <ToolHeaderIcon icon={Blocks} />
          Example tool invocation
        </ToolHeader>
        <ToolContent>
          {!isError && (
            <div className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
              This is the tool content area. In real tools this would contain diffs, code blocks, or
              other output.
            </div>
          )}
        </ToolContent>
      </Tool>
    </PlaygroundPage>
  );
}
