import { useTranslation } from "react-i18next";

import type { BashOutputUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function BashOutputTool({ invocation }: { invocation: BashOutputUIToolInvocation }) {
  const { t } = useTranslation();
  if (!invocation) return null;
  const { state, input, output } = invocation;

  const title = input?.bash_id ? `BashOutput (${input.bash_id})` : "BashOutput";

  return (
    <Tool>
      <ToolHeader type="tool-BashOutput" state={state} title={title} />
      <ToolContent>
        {typeof output === "string" && output ? (
          <CodeBlock code={output} language="bash" className="text-sm" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {input?.filter
              ? t("chat.tools.bashOutput.pollingFiltered", { filter: input.filter })
              : t("chat.tools.bashOutput.polling")}
          </p>
        )}
      </ToolContent>
    </Tool>
  );
}
