import type { ReadUIToolInvocation } from "../../../../../../shared/claude-code/types";

import type { BundledLanguage } from "shiki";
import { CodeBlock, CodeBlockCopyButton } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function ReadTool({ invocation }: { invocation: ReadUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const code = output?.replace(/^\s*(\d+)→/gm, "");
  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const title = input?.file_path ? `Read ${input.file_path}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-Read" state={state} title={title} />
      <ToolContent>
        {code ? (
          <CodeBlock code={code} language={language} className="text-xs">
            <CodeBlockCopyButton />
          </CodeBlock>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
