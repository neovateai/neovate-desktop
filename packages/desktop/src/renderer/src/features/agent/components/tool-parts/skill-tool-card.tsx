import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Renders a Skill tool invocation card for executing slash commands/skills. */
export function SkillToolCard({ part }: Props) {
  const input = part.input as {
    skill: string;
    args?: string;
  };

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader title={input.skill} type="dynamic-tool" toolName="Skill" state={part.state} />
      <ToolContent>
        {/* Skill name */}
        <div className="text-xs text-muted-foreground mb-2">
          Skill: <code className="bg-muted px-1 rounded">/{input.skill}</code>
        </div>

        {/* Arguments */}
        {input.args && (
          <div className="space-y-1 mb-3">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Arguments
            </h4>
            <p className="text-sm whitespace-pre-wrap font-mono">{input.args}</p>
          </div>
        )}

        {/* Result output */}
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}
