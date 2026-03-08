import type { ExitPlanModeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function ExitPlanModeTool({ invocation }: { invocation: ExitPlanModeUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  return (
    <Tool>
      <ToolHeader type="tool-ExitPlanMode" state={state} title="Exit Plan Mode" />
      <ToolContent>
        {input?.plan ? <MessageResponse>{input.plan}</MessageResponse> : null}
      </ToolContent>
    </Tool>
  );
}
