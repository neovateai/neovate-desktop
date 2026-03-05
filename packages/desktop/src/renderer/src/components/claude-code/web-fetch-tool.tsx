import type { WebFetchUIToolInvocation } from "../../../../shared/claude-code";

import { CodeBlock } from "../ai-elements/code-block";
import { MessageResponse } from "../ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeWebFetchTool({ invocation }: { invocation: WebFetchUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const title = input?.url ? `WebFetch ${input.url}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-WebFetch" state={state} title={title} />
      <ToolContent className="space-y-3">
        {input?.prompt ? (
          <div className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Prompt
            </h4>
            <CodeBlock code={input.prompt} language="markdown" className="text-sm" />
          </div>
        ) : null}
        {output ? (
          <div className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Result
            </h4>
            <MessageResponse>{output}</MessageResponse>
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
