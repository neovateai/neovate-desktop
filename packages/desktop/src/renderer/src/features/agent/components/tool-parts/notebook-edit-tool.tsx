import type { NotebookEditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function NotebookEditTool({ invocation }: { invocation: NotebookEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const title = input?.notebook_path ? `NotebookEdit ${input.notebook_path}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-NotebookEdit" state={state} title={title} />
      <ToolContent>
        {input?.new_source ? (
          <CodeBlock code={input.new_source} language="python" className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
