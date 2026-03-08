import type { WebSearchUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function WebSearchTool({ invocation }: { invocation: WebSearchUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const title = input?.query ? `WebSearch "${input.query}"` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-WebSearch" state={state} title={title} />
      <ToolContent>{output ? <MessageResponse>{output}</MessageResponse> : null}</ToolContent>
    </Tool>
  );
}
