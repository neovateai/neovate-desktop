import type { ClaudeCodeTools, TaskUIToolInvocation } from "../../../../shared/claude-code";

import { MessageResponse } from "../ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";
import {
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
} from "ai";
import { type ReactNode, useMemo } from "react";

export function ClaudeCodeTaskTool({
  message,
  invocation,
  renderToolPart,
}: {
  message: UIMessage<unknown, UIDataTypes, ClaudeCodeTools>;
  invocation: TaskUIToolInvocation;
  renderToolPart?: (part: ToolUIPart<ClaudeCodeTools> | DynamicToolUIPart) => ReactNode;
}) {
  const childrenToolUIParts = useMemo(
    () =>
      message.parts
        .filter((part) => {
          if (!isToolUIPart(part)) return false;
          return (
            part.type !== "tool-Task" &&
            part.state !== "input-streaming" &&
            part.callProviderMetadata?.claudeCode?.parentToolUseId === invocation.toolCallId
          );
        })
        .filter((part) => isToolUIPart(part)),
    [message.parts, invocation.toolCallId],
  );

  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const title = input?.description ? `Task: ${input.description}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-Task" state={state} title={title} />
      <ToolContent className="space-y-2">
        {input?.prompt ? (
          <div className="rounded-md border">
            <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Prompt
            </div>
            <div className="px-3 py-2">
              <MessageResponse>{input.prompt}</MessageResponse>
            </div>
          </div>
        ) : null}
        {childrenToolUIParts.map((part) => renderToolPart?.(part))}
        {Array.isArray(output)
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
      </ToolContent>
    </Tool>
  );
}
