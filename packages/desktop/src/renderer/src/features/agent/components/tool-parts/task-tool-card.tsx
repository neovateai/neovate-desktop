import type {
  AgentMessage,
  ToolInvocationPart,
} from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";
import { selectChildToolParts } from "../../store";
import { ClaudeCodeToolUIPart } from "./claude-code-tool-ui-part";

type Props = {
  part: ToolInvocationPart;
  /** The full agent message list — used for finding child tool parts. */
  messages: AgentMessage[];
};

/**
 * Task tool card that renders nested child tool invocations.
 *
 * The Task tool (sub-agent) spawns child tool calls whose
 * `parentToolUseId` matches this part's `toolCallId`.
 */
export function TaskToolCard({ part, messages }: Props) {
  const input = part.input as { description?: string; prompt?: string };

  // Collect child tool parts from all messages
  const childParts: ToolInvocationPart[] = [];
  for (const msg of messages) {
    childParts.push(...selectChildToolParts(msg, part.toolCallId));
  }

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.description ?? "Task"}
        type="dynamic-tool"
        toolName="Task"
        state={part.state}
      />
      <ToolContent>
        {input.prompt && (
          <div className="space-y-1">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Prompt
            </h4>
            <p className="text-sm whitespace-pre-wrap">{input.prompt}</p>
          </div>
        )}

        {/* Render child tool invocations */}
        {childParts.length > 0 && (
          <div className="space-y-2 border-l-2 border-border pl-3">
            {childParts.map((child) => (
              <ClaudeCodeToolUIPart key={child.toolCallId} part={child} messages={messages} />
            ))}
          </div>
        )}

        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
