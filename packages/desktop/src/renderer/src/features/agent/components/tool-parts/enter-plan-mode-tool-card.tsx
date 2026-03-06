import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders an EnterPlanMode tool invocation card. */
export function EnterPlanModeToolCard({ part }: Props) {
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title="Enter Plan Mode"
        type="dynamic-tool"
        toolName="EnterPlanMode"
        state={part.state}
      />
      <ToolContent>
        <div className="text-sm text-muted-foreground mb-2">
          Switched to <span className="font-medium text-foreground">plan mode</span> for read-only
          exploration and planning.
        </div>
      </ToolContent>
    </Tool>
  );
}
