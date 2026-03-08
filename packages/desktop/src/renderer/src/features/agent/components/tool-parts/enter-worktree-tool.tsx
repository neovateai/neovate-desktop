import type { EnterWorktreeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function EnterWorktreeTool({ invocation }: { invocation: EnterWorktreeUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, output } = invocation;

  return (
    <Tool>
      <ToolHeader type="tool-EnterWorktree" state={state} title="Enter Worktree" />
      <ToolContent>
        {typeof output === "string" && output ? <MessageResponse>{output}</MessageResponse> : null}
      </ToolContent>
    </Tool>
  );
}
