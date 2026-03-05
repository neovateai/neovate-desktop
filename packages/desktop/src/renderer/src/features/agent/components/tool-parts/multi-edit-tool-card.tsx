import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a MultiEdit tool invocation card. */
export function MultiEditToolCard({ part }: Props) {
  const input = part.input as {
    file_path?: string;
    edits?: Array<{ old_string: string; new_string: string }>;
  };
  const editCount = input.edits?.length ?? 0;
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.file_path ? `MultiEdit: ${input.file_path} (${editCount} edits)` : "MultiEdit"}
        type="dynamic-tool"
        toolName="MultiEdit"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
