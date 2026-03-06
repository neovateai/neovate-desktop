import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a TaskOutput tool invocation card for fetching output from background tasks. */
export function TaskOutputToolCard({ part }: Props) {
  const input = part.input as {
    task_id?: string;
    block?: boolean;
    timeout?: number;
  };

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title="Task Output"
        type="dynamic-tool"
        toolName="TaskOutput"
        state={part.state}
      />
      <ToolContent>
        <div className="space-y-2 text-sm mb-3">
          <div className="text-muted-foreground">
            Task ID: <code className="bg-muted px-1 rounded">{input.task_id}</code>
          </div>
          <div className="flex gap-4 text-muted-foreground">
            {input.block !== undefined && (
              <span>
                Block: <span className="text-foreground">{input.block ? "Yes" : "No"}</span>
              </span>
            )}
            {input.timeout !== undefined && (
              <span>
                Timeout: <span className="text-foreground">{input.timeout}ms</span>
              </span>
            )}
          </div>
        </div>
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
