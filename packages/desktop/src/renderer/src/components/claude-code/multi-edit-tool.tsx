import type { MultiEditUIToolInvocation } from "../../../../shared/claude-code";

import type { BundledLanguage } from "shiki";
import { CodeBlock } from "../ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeMultiEditTool({ invocation }: { invocation: MultiEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const editCount = input?.edits?.length ?? 0;
  const title = input?.file_path ? `MultiEdit ${input.file_path} (${editCount} edits)` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-MultiEdit" state={state} title={title} />
      <ToolContent>
        {input?.edits?.map((edit, index) => (
          <div key={edit.old_string} className="space-y-2">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Edit {index + 1}
            </h4>
            {edit.old_string ? (
              <div className="space-y-1">
                <h5 className="text-muted-foreground text-xs">Old</h5>
                <CodeBlock code={edit.old_string} language={language} className="text-xs" />
              </div>
            ) : null}
            {edit.new_string ? (
              <div className="space-y-1">
                <h5 className="text-muted-foreground text-xs">New</h5>
                <CodeBlock code={edit.new_string} language={language} className="text-xs" />
              </div>
            ) : null}
          </div>
        ))}
      </ToolContent>
    </Tool>
  );
}
