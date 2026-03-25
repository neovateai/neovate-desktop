import { useTranslation } from "react-i18next";

import type { SlashCommandUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function SlashCommandTool({ invocation }: { invocation: SlashCommandUIToolInvocation }) {
  const { t } = useTranslation();
  if (!invocation) return null;
  const { state, input, output, errorText } = invocation;

  const title = input?.command ? `SlashCommand ${input.command}` : "SlashCommand";

  return (
    <Tool>
      <ToolHeader type="tool-SlashCommand" state={state} title={title} />
      <ToolContent>
        {errorText ? (
          <p className="text-sm text-destructive">{errorText}</p>
        ) : output?.text ? (
          <MessageResponse>{output.text}</MessageResponse>
        ) : (
          <p className="text-sm text-muted-foreground">{t("chat.tools.slashCommand.running")}</p>
        )}
      </ToolContent>
    </Tool>
  );
}
