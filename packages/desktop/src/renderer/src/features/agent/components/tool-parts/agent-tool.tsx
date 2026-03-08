import type { AgentUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function AgentTool({ invocation }: { invocation: AgentUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  return (
    <Tool>
      <ToolHeader type="tool-Agent" state={state} title={input?.description ?? "Agent"} />
      <ToolContent className="space-y-3">
        {input?.prompt ? (
          <div className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Prompt
            </h4>
            <MessageResponse>{input.prompt}</MessageResponse>
          </div>
        ) : null}
        {typeof output === "string" && output ? <MessageResponse>{output}</MessageResponse> : null}
      </ToolContent>
    </Tool>
  );
}
