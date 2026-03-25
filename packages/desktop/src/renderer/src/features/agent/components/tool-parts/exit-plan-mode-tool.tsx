import type { ExitPlanModeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function ExitPlanModeTool({ invocation }: { invocation: ExitPlanModeUIToolInvocation }) {
  // Hide while approval dialog is active (same pattern as AskUserQuestionTool)
  if (
    !invocation ||
    invocation.state === "input-streaming" ||
    invocation.state === "input-available" ||
    !invocation.output
  ) {
    return null;
  }
  const { state, output } = invocation;

  return (
    <Tool>
      <ToolHeader type="tool-ExitPlanMode" state={state} title="Exit Plan Mode" />
      <ToolContent>
        <p className="text-sm text-muted-foreground">{output}</p>
      </ToolContent>
    </Tool>
  );
}
