import type { GlobUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { ToolOutputImage } from "./tool-output-image";

export function GlobTool({ invocation }: { invocation: GlobUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const parts = [
    input?.pattern ? `"${input.pattern}"` : null,
    input?.path ? `in ${input.path}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const title = parts ? `Glob for ${parts}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-Glob" state={state} title={title} />
      <ToolContent>
        {output?.text ? <CodeBlock code={output.text} language="bash" className="text-sm" /> : null}
        <ToolOutputImage images={output?.images} />
      </ToolContent>
    </Tool>
  );
}
