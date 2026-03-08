import type { EnterPlanModeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function EnterPlanModeTool({ invocation }: { invocation: EnterPlanModeUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state } = invocation;

  return (
    <Tool>
      <ToolHeader type="tool-EnterPlanMode" state={state} title="Enter Plan Mode" />
      <ToolContent>
        <p className="text-sm text-muted-foreground">
          Switched to plan mode for read-only exploration and planning.
        </p>
      </ToolContent>
    </Tool>
  );
}
