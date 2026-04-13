import { Regex } from "lucide-react";

import type { GrepUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function GrepTool({ invocation }: { invocation: GrepUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={Regex} />
        <span className="shrink-0">Grep</span>
        <span className="min-w-0 truncate">
          {input?.pattern && <>for "{input.pattern}"</>} {input?.path && <>in {input.path}</>}
        </span>
      </ToolHeader>
      <ToolContent>
        {typeof output === "string" ? <pre className="text-xs">{output}</pre> : null}
      </ToolContent>
    </Tool>
  );
}
