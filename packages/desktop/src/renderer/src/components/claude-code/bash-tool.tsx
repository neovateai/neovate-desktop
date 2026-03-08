import type { BashUIToolInvocation } from "../../../../shared/claude-code";

import { CodeBlock } from "../ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeBashTool({ invocation }: { invocation: BashUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const terminalOutput = input?.command
    ? `$ ${input.command}${output ? `\n${output}` : ""}`
    : (output ?? "");

  return (
    <Tool>
      <ToolHeader type="tool-Bash" state={state} title={input?.description} />
      <ToolContent>
        {terminalOutput ? (
          <CodeBlock code={terminalOutput} language="bash" className="text-sm" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
