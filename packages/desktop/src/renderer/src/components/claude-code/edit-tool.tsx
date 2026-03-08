import type { EditUIToolInvocation } from "../../../../shared/claude-code";

import type { BundledLanguage } from "shiki";
import { CodeBlock } from "../ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeEditTool({ invocation }: { invocation: EditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const title = input?.file_path ? `Edit ${input.file_path}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-Edit" state={state} title={title} />
      <ToolContent className="space-y-2">
        {input?.old_string ? (
          <>
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Old String
            </h4>
            <CodeBlock code={input.old_string} language={language} className="text-xs" />
          </>
        ) : null}
        {input?.new_string ? (
          <>
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              New String
            </h4>
            <CodeBlock code={input.new_string} language={language} className="text-xs" />
          </>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
