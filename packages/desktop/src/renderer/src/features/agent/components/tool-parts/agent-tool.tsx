import type { ReactNode } from "react";

import { type ToolUIPart } from "ai";
import { Bot, MessageSquare } from "lucide-react";

import type {
  AgentUIToolInvocation,
  ClaudeCodeUIMessage,
  ClaudeCodeUITools,
} from "../../../../../../shared/claude-code/types";

import { isClaudeCodeUIMessage } from "../../../../../../shared/claude-code/types";
import { MessageResponse } from "../../../../components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { CollapsibleTrigger } from "../../../../components/ui/collapsible";
import { MessagePartRenderer } from "../message-parts";

export function AgentTool({
  invocation,
  renderToolPart,
}: {
  invocation: AgentUIToolInvocation;
  renderToolPart?: (message: ClaudeCodeUIMessage, part: ToolUIPart<ClaudeCodeUITools>) => ReactNode;
}) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { input, output } = invocation;
  const agentMessage = isClaudeCodeUIMessage(output) ? output : undefined;

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={Bot} />
        <span className="min-w-0 truncate">{input?.description ?? "Agent"}</span>
      </ToolHeader>
      <ToolContent className="flex gap-0 bg-transparent rounded-none p-0">
        <CollapsibleTrigger className="relative w-3 shrink-0 cursor-pointer pl-1.5 before:absolute before:inset-y-0 before:left-1.5 before:w-px before:bg-border before:transition-colors hover:before:bg-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-3 pl-2">
          {input?.prompt ? (
            <Tool invocation={invocation} defaultOpen>
              <ToolHeader>
                <ToolHeaderIcon icon={MessageSquare} />
                <span className="min-w-0 truncate">Prompt</span>
              </ToolHeader>
              <ToolContent>
                <MessageResponse>{input.prompt}</MessageResponse>
              </ToolContent>
            </Tool>
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
        </div>
      </ToolContent>
    </Tool>
  );
}
