import { Globe } from "lucide-react";

import type { WebSearchUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function WebSearchTool({ invocation }: { invocation: WebSearchUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { input, output } = invocation;

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={Globe} />
        <span className="shrink-0">WebSearch</span>
        {input?.query && <span className="min-w-0 truncate">"{input.query}"</span>}
      </ToolHeader>
      <ToolContent>{output ? <MessageResponse>{output}</MessageResponse> : null}</ToolContent>
    </Tool>
  );
}
