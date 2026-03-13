import type { ReactNode } from "react";

import { type ToolUIPart } from "ai";

import type {
  AgentUIToolInvocation,
  ClaudeCodeUIMessage,
  ClaudeCodeUITools,
} from "../../../../../../shared/claude-code/types";

import { isClaudeCodeUIMessage } from "../../../../../../shared/claude-code/types";
import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { MessagePartRenderer } from "../message-parts";

export function AgentTool({
  invocation,
  renderToolPart,
}: {
  invocation: AgentUIToolInvocation;
  renderToolPart?: (message: ClaudeCodeUIMessage, part: ToolUIPart<ClaudeCodeUITools>) => ReactNode;
}) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;
  const agentMessage = isClaudeCodeUIMessage(output) ? output : undefined;
  const preliminary = state === "output-available" && invocation.preliminary === true;

  return (
    <Tool defaultOpen={agentMessage != null || output != null}>
      <ToolHeader
        type="tool-Agent"
        state={state}
        preliminary={preliminary}
        title={input?.description ?? "Agent"}
      />
      <ToolContent className="space-y-3">
        {input?.prompt ? (
          <div className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Prompt
            </h4>
            <MessageResponse>{input.prompt}</MessageResponse>
          </div>
        ) : null}
        {agentMessage != null ? (
          <MessagePartRenderer
            message={agentMessage}
            renderToolPart={(agentPartMessage, part) => renderToolPart?.(agentPartMessage, part)}
          />
        ) : null}
        {agentMessage == null && Array.isArray(output)
          ? output.map((part) => {
              switch (part.type) {
                case "text":
                  return (
                    <div key={part.text}>
                      <MessageResponse>{part.text}</MessageResponse>
                    </div>
                  );
                default:
                  return null;
              }
            })
          : null}
        {agentMessage == null && typeof output === "string" && output ? (
          <MessageResponse>{output}</MessageResponse>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
