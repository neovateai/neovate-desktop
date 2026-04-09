import { LogOut } from "lucide-react";

import type { ExitPlanModeUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function ExitPlanModeTool({ invocation }: { invocation: ExitPlanModeUIToolInvocation }) {
  if (
    !invocation ||
    invocation.state === "input-streaming" ||
    invocation.state === "input-available" ||
    !invocation.output
  ) {
    return null;
  }
  const { state, output } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={LogOut} />
        Exit Plan Mode
      </ToolHeader>
      <ToolContent>
        <p className="text-sm text-muted-foreground">{output}</p>
      </ToolContent>
    </Tool>
  );
}
