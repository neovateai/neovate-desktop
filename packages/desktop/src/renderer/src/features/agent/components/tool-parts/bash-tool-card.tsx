import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a Bash tool invocation card. */
export function BashToolCard({ part }: Props) {
  const input = part.input as { command?: string; description?: string };
  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.description ?? "Bash"}
        type="dynamic-tool"
        toolName="Bash"
        state={part.state}
      />
      <ToolContent>
        <ToolInput input={{ command: input.command }} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
