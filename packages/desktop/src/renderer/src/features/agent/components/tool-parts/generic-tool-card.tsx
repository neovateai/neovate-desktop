import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/**
 * Generic fallback card for tools without a specialised UI
 * (e.g. TodoWrite, BashOutput, KillShell, SlashCommand, ExitPlanMode).
 */
export function GenericToolCard({ part }: Props) {
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={part.toolName}
        type="dynamic-tool"
        toolName={part.toolName}
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
