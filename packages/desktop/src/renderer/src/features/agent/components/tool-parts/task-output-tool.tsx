import { ClipboardList } from "lucide-react";

import type { TaskOutputUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function TaskOutputTool({ invocation }: { invocation: TaskOutputUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={ClipboardList} />
        TaskOutput {input?.task_id && `(${input.task_id})`}
      </ToolHeader>
      <ToolContent>
        {typeof output === "string" && output ? (
          <CodeBlock code={output} language="bash" className="text-sm" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
