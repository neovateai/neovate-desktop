import type { GlobUIToolInvocation } from "../../../../shared/claude-code";

import { CodeBlock } from "../ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeGlobTool({ invocation }: { invocation: GlobUIToolInvocation }) {
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
        {typeof output === "string" ? (
          <CodeBlock code={output} language="bash" className="text-sm" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
