import type { BashUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { ToolOutputImage } from "./tool-output-image";

export function BashTool({ invocation }: { invocation: BashUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const terminalOutput =
    typeof output === "string"
      ? input?.command
        ? `$ ${input.command}${output ? `\n${output}` : ""}`
        : output
      : "";

  return (
    <Tool>
      <ToolHeader type="tool-Bash" state={state} title={input?.description} />
      <ToolContent>
        {terminalOutput ? (
          <CodeBlock code={terminalOutput} language="bash" className="text-sm" />
        ) : (
          <ToolOutputImage output={output} />
        )}
      </ToolContent>
    </Tool>
  );
}
