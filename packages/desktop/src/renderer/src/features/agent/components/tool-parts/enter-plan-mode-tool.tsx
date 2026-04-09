import { Map } from "lucide-react";

import type { EnterPlanModeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function EnterPlanModeTool({ invocation }: { invocation: EnterPlanModeUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={Map} />
        Enter Plan Mode
      </ToolHeader>
      <ToolContent>
        <p className="text-sm text-muted-foreground">
          Switched to plan mode for read-only exploration and planning.
        </p>
      </ToolContent>
    </Tool>
  );
}
