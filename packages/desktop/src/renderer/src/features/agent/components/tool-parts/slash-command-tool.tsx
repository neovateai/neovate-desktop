import type { SlashCommandUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function SlashCommandTool({ invocation }: { invocation: SlashCommandUIToolInvocation }) {
  if (!invocation) return null;
  const { state, input, output, errorText } = invocation;

  const title = input?.command ? `SlashCommand ${input.command}` : "SlashCommand";

  return (
    <Tool>
      <ToolHeader type="tool-SlashCommand" state={state} title={title} />
      <ToolContent>
        {errorText ? (
          <p className="text-sm text-destructive">{errorText}</p>
        ) : typeof output === "string" && output ? (
          <MessageResponse>{output}</MessageResponse>
        ) : (
          <p className="text-sm text-muted-foreground">
            Running the slash command and waiting for a response.
          </p>
        )}
      </ToolContent>
    </Tool>
  );
}
