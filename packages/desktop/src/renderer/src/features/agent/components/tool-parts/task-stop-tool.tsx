import { Square } from "lucide-react";

import type { TaskStopUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolHeader, ToolHeaderIcon } from "../../../../components/ai-elements/tool";

export function TaskStopTool({ invocation }: { invocation: TaskStopUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { input } = invocation;

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={Square} />
        TaskStop {input?.task_id && `(${input.task_id})`}
      </ToolHeader>
    </Tool>
  );
}
