import { BookOpen } from "lucide-react";

import type { NotebookEditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function NotebookEditTool({ invocation }: { invocation: NotebookEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;

  const fileName = input?.notebook_path?.split("/").pop();

  return (
    <Tool state={state} errorText={errorText}>
      <ToolHeader>
        <ToolHeaderIcon icon={BookOpen} />
        NotebookEdit {fileName}
      </ToolHeader>
      <ToolContent>
        {input?.new_source ? (
          <CodeBlock code={input.new_source} language="python" className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
