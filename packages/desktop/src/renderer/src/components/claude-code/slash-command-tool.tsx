import type { SlashCommandUIToolInvocation } from "../../../../shared/claude-code";

import { cn } from "../../lib/utils";
import { MessageResponse } from "../ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../ai-elements/tool";

export function ClaudeCodeSlashCommandTool({
  invocation,
}: {
  invocation: SlashCommandUIToolInvocation;
}) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output, errorText } = invocation;

  const isError = state === "output-error";
  const title = input?.command ? `Slash command ${input.command}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-SlashCommand" state={state} title={title} />
      <ToolContent>
        <div className={cn("rounded-md border", isError && "border-destructive")}>
          <div
            className={cn(
              "border-b p-2 text-sm font-mono",
              isError && "border-destructive bg-destructive/10",
            )}
          >
            {input?.command}
          </div>
          <div className="px-3 py-2">
            <MessageResponse>{state === "output-available" ? output : errorText}</MessageResponse>
          </div>
        </div>
      </ToolContent>
    </Tool>
  );
}
