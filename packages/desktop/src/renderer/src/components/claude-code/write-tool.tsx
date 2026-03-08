import type { WriteUIToolInvocation } from "../../../../shared/claude-code";

import type { BundledLanguage } from "shiki";
import { CodeBlock } from "../ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeWriteTool({ invocation }: { invocation: WriteUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const title = input?.file_path ? `Write ${input.file_path}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-Write" state={state} title={title} />
      <ToolContent>
        {input?.content ? (
          <CodeBlock code={input.content} language={language} className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
