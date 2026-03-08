import type { BashOutputUIToolInvocation } from "../../../../shared/claude-code/types";

import { CodeBlock } from "../ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeBashOutputTool({
  invocation,
}: {
  invocation: BashOutputUIToolInvocation;
}) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const title = input?.bash_id ? `Bash Output (${input.bash_id})` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-BashOutput" state={state} title={title} />
      <ToolContent>
        {output ? <CodeBlock code={output} language="bash" className="text-sm" /> : null}
      </ToolContent>
    </Tool>
  );
}
