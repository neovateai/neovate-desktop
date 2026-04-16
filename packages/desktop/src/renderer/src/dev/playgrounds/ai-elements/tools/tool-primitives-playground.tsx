import type { UITool, UIToolInvocation } from "ai";

import { Blocks } from "lucide-react";
import { useMemo, useState } from "react";

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
  | "output-error-long"
  | "output-error-no-text";

export function ToolPrimitivesPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  const isError =
    scenario === "output-error" ||
    scenario === "output-error-long" ||
    scenario === "output-error-no-text";
  const errorText =
    scenario === "output-error"
      ? "Something went wrong while executing the tool.\nPlease try again."
      : scenario === "output-error-long"
        ? "Error: ENOENT: no such file or directory, open '/Users/developer/projects/my-app/src/components/features/authentication/providers/oauth2/callback-handler.tsx' — The file was expected at this path but could not be found. This may indicate that the file was moved, renamed, or deleted during a recent refactor. Please verify the import paths and ensure the module exists before retrying the operation."
        : undefined;
  const state = isError ? "output-error" : scenario;

  const invocation = useMemo(
    () =>
      ({
        toolCallId: "playground",
        state,
        input: undefined,
        errorText,
      }) as UIToolInvocation<UITool>,
    [state, errorText],
  );

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
            active={scenario === "output-error-long"}
            onClick={() => setScenario("output-error-long")}
          >
            Error (long)
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
      <Tool invocation={invocation}>
        <ToolHeader>
          <ToolHeaderIcon icon={Blocks} />
          Example tool invocation
        </ToolHeader>
        <ToolContent>
          {!isError && (
            <p className="text-sm text-muted-foreground">
              This is the tool content area. In real tools this would contain diffs, code blocks, or
              other output.
            </p>
          )}
        </ToolContent>
      </Tool>
    </PlaygroundPage>
  );
}
