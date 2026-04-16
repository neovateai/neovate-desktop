import type { UITool, UIToolInvocation } from "ai";

import { Wrench } from "lucide-react";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";

type GenericToolProps = {
  toolName: string;
  invocation: UIToolInvocation<UITool>;
};

function formatToolName(toolName: string): string {
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    const server = parts[1] ?? "unknown";
    const tool = parts.slice(2).join("__") || "unknown";
    return `${server} / ${tool}`;
  }
  return toolName;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const texts = value
      .filter(
        (block): block is { type: string; text: string } =>
          block?.type === "text" && typeof block?.text === "string",
      )
      .map((block) => block.text);
    if (texts.length > 0) return texts.join("\n");
  }
  return JSON.stringify(value, null, 2);
}

export function GenericTool({ toolName, invocation }: GenericToolProps) {
  const display = formatToolName(toolName);
  const { input, output } = invocation;

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={Wrench} />
        <span>{display}</span>
      </ToolHeader>
      <ToolContent>
        {input != null && (
          <>
            <div className="text-muted-foreground mb-1 text-xs font-medium">Input</div>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
              {JSON.stringify(input, null, 2)}
            </pre>
          </>
        )}
        {output != null && (
          <>
            <div className="text-muted-foreground mt-2 mb-1 text-xs font-medium">Output</div>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
              {formatValue(output)}
            </pre>
          </>
        )}
      </ToolContent>
    </Tool>
  );
}
