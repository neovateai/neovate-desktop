import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a Grep tool invocation card. */
export function GrepToolCard({ part }: Props) {
  const input = part.input as { pattern?: string; path?: string; glob?: string };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.pattern ? `Grep: ${input.pattern}` : "Grep"}
        type="dynamic-tool"
        toolName="Grep"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
