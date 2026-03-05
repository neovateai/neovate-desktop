import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a Write tool invocation card. */
export function WriteToolCard({ part }: Props) {
  const input = part.input as { file_path?: string; content?: string };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.file_path ? `Write: ${input.file_path}` : "Write"}
        type="dynamic-tool"
        toolName="Write"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
