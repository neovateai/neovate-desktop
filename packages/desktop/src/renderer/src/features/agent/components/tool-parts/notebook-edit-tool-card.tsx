import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders a NotebookEdit tool invocation card. */
export function NotebookEditToolCard({ part }: Props) {
  const input = part.input as {
    notebook_path?: string;
    cell_number?: number;
    edit_mode?: string;
  };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.notebook_path ? `NotebookEdit: ${input.notebook_path}` : "NotebookEdit"}
        type="dynamic-tool"
        toolName="NotebookEdit"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
