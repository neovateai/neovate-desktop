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
  const { input } = invocation;

  const fileName = input?.notebook_path?.split("/").pop();

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={BookOpen} />
        NotebookEdit {fileName}
      </ToolHeader>
      <ToolContent className="p-0">
        {input?.new_source ? (
          <CodeBlock code={input.new_source} language="python" className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
