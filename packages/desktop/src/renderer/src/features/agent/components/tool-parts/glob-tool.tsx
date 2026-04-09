import { Search } from "lucide-react";

import type { GlobUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

export function GlobTool({ invocation }: { invocation: GlobUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output } = invocation;

  return (
    <Tool state={state}>
      <ToolHeader>
        <ToolHeaderIcon icon={Search} />
        Glob {input?.pattern && <>for "{input.pattern}"</>} {input?.path && <>in {input.path}</>}
      </ToolHeader>
      <ToolContent>
        {typeof output === "string" ? (
          <CodeBlock code={output} language="bash" className="text-sm" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
