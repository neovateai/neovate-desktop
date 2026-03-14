import { AlertCircle } from "lucide-react";

import type { NotebookEditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function NotebookEditTool({ invocation }: { invocation: NotebookEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;

  const title = input?.notebook_path ? `NotebookEdit ${input.notebook_path}` : undefined;
  const hasError = state === "output-error";

  return (
    <Tool>
      <ToolHeader type="tool-NotebookEdit" state={state} title={title} />
      <ToolContent>
        {hasError && errorText ? (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{errorText}</span>
          </div>
        ) : input?.new_source ? (
          <CodeBlock code={input.new_source} language="python" className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
