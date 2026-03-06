import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders a WebSearch tool invocation card. */
export function WebSearchToolCard({ part }: Props) {
  const input = part.input as { query?: string };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.query ? `Search: ${input.query}` : "WebSearch"}
        type="dynamic-tool"
        toolName="WebSearch"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
