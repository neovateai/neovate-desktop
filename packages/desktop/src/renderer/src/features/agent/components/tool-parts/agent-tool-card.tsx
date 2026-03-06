import type { ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader, ToolOutput } from "../../../../components/ai-elements/tool";

type Props = { part: ToolInvocationPart };

/** Parses Agent tool output string to extract agentId and usage stats. */
function parseAgentOutput(output: string | null | undefined): {
  resultText: string;
  agentId?: string;
  usage?: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
} {
  if (!output || typeof output !== "string") {
    return { resultText: "" };
  }

  let resultText = output;
  let agentId: string | undefined;
  let usage: { total_tokens: number; tool_uses: number; duration_ms: number } | undefined;

  // Extract agentId: "agentId: <hex> (for resuming..."
  const agentIdMatch = output.match(/agentId:\s*([a-f0-9]+)/);
  if (agentIdMatch) {
    agentId = agentIdMatch[1];
    // Remove the agentId line from result text
    resultText = resultText.replace(/agentId:\s*[a-f0-9]+\s*\(for resuming[^)]*\)\n?/, "").trim();
  }

  // Extract usage block: <usage>total_tokens: N\ntool_uses: N\nduration_ms: N</usage>
  const usageMatch = output.match(
    /<usage>total_tokens:\s*(\d+)\ntool_uses:\s*(\d+)\nduration_ms:\s*(\d+)<\/usage>/,
  );
  if (usageMatch) {
    usage = {
      total_tokens: parseInt(usageMatch[1], 10),
      tool_uses: parseInt(usageMatch[2], 10),
      duration_ms: parseInt(usageMatch[3], 10),
    };
    // Remove the usage block from result text
    resultText = resultText.replace(/<usage>[\s\S]*?<\/usage>/, "").trim();
  }

  return { resultText, agentId, usage };
}

/** Renders an Agent tool invocation card for launching sub-agents. */
export function AgentToolCard({ part }: Props) {
  const input = part.input as {
    subagent_type?: string;
    description?: string;
    prompt?: string;
  };

  // Parse the string output
  const { resultText, agentId, usage } = parseAgentOutput(
    typeof part.output === "string" ? part.output : null,
  );

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title={input.description ?? "Agent"}
        type="dynamic-tool"
        toolName="Agent"
        state={part.state}
      />
      <ToolContent>
        {/* Subagent type badge */}
        {input.subagent_type && (
          <div className="text-xs text-muted-foreground mb-2">
            Type: <code className="bg-muted px-1 rounded">{input.subagent_type}</code>
          </div>
        )}

        {/* Prompt */}
        {input.prompt && (
          <div className="space-y-1 mb-3">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Prompt
            </h4>
            <p className="text-sm whitespace-pre-wrap">{input.prompt}</p>
          </div>
        )}

        {/* Result output */}
        <ToolOutput output={resultText || part.output} errorText={part.errorText} />

        {/* Agent ID for resuming */}
        {agentId && (
          <div className="text-xs text-muted-foreground mt-2">
            Agent ID: <code className="bg-muted px-1 rounded">{agentId}</code>
          </div>
        )}

        {/* Usage stats */}
        {usage && (
          <div className="flex gap-4 text-xs text-muted-foreground mt-3 pt-2 border-t">
            <span>Tokens: {usage.total_tokens}</span>
            <span>Tools: {usage.tool_uses}</span>
            <span>Duration: {(usage.duration_ms / 1000).toFixed(1)}s</span>
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}
