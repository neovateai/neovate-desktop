import type { TaskOutputUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function TaskOutputTool({ invocation }: { invocation: TaskOutputUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const title = input?.task_id ? `TaskOutput (${input.task_id})` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-TaskOutput" state={state} title={title} />
      <ToolContent>
        {typeof output === "string" && output ? (
          <CodeBlock code={output} language="bash" className="text-sm" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
