import type { SkillUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { MessageResponse } from "../../../../components/ai-elements/message";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function SkillTool({ invocation }: { invocation: SkillUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  const title = input?.skill ? `Skill /${input.skill}` : undefined;

  return (
    <Tool>
      <ToolHeader type="tool-Skill" state={state} title={title} />
      <ToolContent>
        {typeof output === "string" && output ? <MessageResponse>{output}</MessageResponse> : null}
      </ToolContent>
    </Tool>
  );
}
