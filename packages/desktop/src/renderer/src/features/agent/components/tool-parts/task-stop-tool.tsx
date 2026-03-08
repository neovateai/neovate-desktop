import type { TaskStopUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function TaskStopTool({ invocation }: { invocation: TaskStopUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const title = input?.task_id ? `TaskStop (${input.task_id})` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-TaskStop" state={state} title={title} />
      <ToolContent />
    </Tool>
  );
}
