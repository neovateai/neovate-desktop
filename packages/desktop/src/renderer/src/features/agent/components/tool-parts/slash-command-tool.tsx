import { Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SlashCommandUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function SlashCommandTool({ invocation }: { invocation: SlashCommandUIToolInvocation }) {
  const { t } = useTranslation();
  if (!invocation) return null;
  const { state, input, output, errorText } = invocation;

  return (
    <Tool state={state} errorText={errorText}>
      <ToolHeader>
        <ToolHeaderIcon icon={Wand2} />
        <span className="shrink-0">SlashCommand</span>
        {input?.command && <span className="min-w-0 truncate">{input.command}</span>}
      </ToolHeader>
      <ToolContent>
        {typeof output === "string" && output ? (
          <MessageResponse>{output}</MessageResponse>
        ) : (
          <p className="text-sm text-muted-foreground">{t("chat.tools.slashCommand.running")}</p>
        )}
      </ToolContent>
    </Tool>
  );
}
