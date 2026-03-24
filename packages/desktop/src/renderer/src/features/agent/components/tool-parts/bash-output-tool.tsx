import type { BashOutputUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function BashOutputTool({ invocation }: { invocation: BashOutputUIToolInvocation }) {
  if (!invocation) return null;
  const { state, input, output } = invocation;

  const title = input?.bash_id ? `BashOutput (${input.bash_id})` : "BashOutput";

  return (
    <Tool>
      <ToolHeader type="tool-BashOutput" state={state} title={title} />
      <ToolContent>
        {typeof output === "string" && output ? (
          <CodeBlock code={output} language="bash" className="text-sm" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Polling background shell output{input?.filter ? ` filtered by ${input.filter}` : ""}.
          </p>
        )}
      </ToolContent>
    </Tool>
  );
}
