import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a Glob tool invocation card. */
export function GlobToolCard({ part }: Props) {
  const input = part.input as { pattern?: string; path?: string };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.pattern ? `Glob: ${input.pattern}` : "Glob"}
        type="dynamic-tool"
        toolName="Glob"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
