import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders a Read tool invocation card. */
export function ReadToolCard({ part }: Props) {
  const input = part.input as { file_path?: string; offset?: number; limit?: number };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.file_path ?? "Read"}
        type="dynamic-tool"
        toolName="Read"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
