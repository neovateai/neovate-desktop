import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders a TaskStop tool invocation card for stopping background tasks. */
export function TaskStopToolCard({ part }: Props) {
  const input = part.input as {
    task_id?: string;
  };

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader title="Task Stop" type="dynamic-tool" toolName="TaskStop" state={part.state} />
      <ToolContent>
        <div className="text-sm text-muted-foreground mb-2">
          Task ID: <code className="bg-muted px-1 rounded">{input.task_id}</code>
        </div>
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
