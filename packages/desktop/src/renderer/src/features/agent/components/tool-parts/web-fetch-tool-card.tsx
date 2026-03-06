import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders a WebFetch tool invocation card. */
export function WebFetchToolCard({ part }: Props) {
  const input = part.input as { url?: string; prompt?: string };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.url ? `Fetch: ${input.url}` : "WebFetch"}
        type="dynamic-tool"
        toolName="WebFetch"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
