import type { WriteUIToolInvocation } from "../../../../../../shared/claude-code/types";

import type { BundledLanguage } from "shiki";
import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function WriteTool({ invocation }: { invocation: WriteUIToolInvocation }) {
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
