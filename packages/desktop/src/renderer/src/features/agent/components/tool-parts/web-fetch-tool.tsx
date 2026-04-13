import { Download } from "lucide-react";

import type { WebFetchUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function WebFetchTool({ invocation }: { invocation: WebFetchUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={Download} />
        <span className="shrink-0">WebFetch</span>
        {input?.url && <span className="min-w-0 truncate">{input.url}</span>}
      </ToolHeader>
      <ToolContent className="space-y-3">
        {input?.prompt ? (
          <div className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Prompt
            </h4>
            <pre className="text-xs">{input.prompt}</pre>
          </div>
        ) : null}
        {output ? (
          <div className="space-y-1">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Result
            </h4>
            <MessageResponse>{output}</MessageResponse>
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
