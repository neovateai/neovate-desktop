import { Search } from "lucide-react";

import type { GlobUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function GlobTool({ invocation }: { invocation: GlobUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { input, output } = invocation;

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={Search} />
        <span className="shrink-0">Glob</span>
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
