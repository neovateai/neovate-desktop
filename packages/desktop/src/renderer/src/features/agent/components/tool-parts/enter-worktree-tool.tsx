import { GitBranch } from "lucide-react";

import type { EnterWorktreeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function EnterWorktreeTool({ invocation }: { invocation: EnterWorktreeUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, output } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={GitBranch} />
        Enter Worktree
      </ToolHeader>
      <ToolContent>
        {typeof output === "string" && output ? <MessageResponse>{output}</MessageResponse> : null}
      </ToolContent>
    </Tool>
  );
}
