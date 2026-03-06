import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Renders an ExitPlanMode tool invocation card. */
export function ExitPlanModeToolCard({ part }: Props) {
  const input = part.input as {
    allowedPrompts?: string[];
  };

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title="Exit Plan Mode"
        type="dynamic-tool"
        toolName="ExitPlanMode"
        state={part.state}
      />
      <ToolContent>
        <div className="text-sm text-muted-foreground mb-2">
          Exited <span className="font-medium text-foreground">plan mode</span> and ready to
          implement.
        </div>

        {/* Allowed prompts */}
        {input.allowedPrompts && input.allowedPrompts.length > 0 && (
          <div className="space-y-1 mb-3">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Allowed Prompts
            </h4>
            <ul className="text-sm list-disc list-inside">
              {input.allowedPrompts.map((prompt, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {prompt}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
