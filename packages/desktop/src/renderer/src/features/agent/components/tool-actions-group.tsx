import { useState } from "react";
import { ChevronDown, FileText, Pencil, Terminal, Search, Wrench } from "lucide-react";
import { cn } from "../../../lib/utils";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "../../../components/ui/collapsible";
import type { ToolCallState } from "../store";

function categorize(name: string): "read" | "write" | "bash" | "search" | "other" {
  if (/read|glob|grep/i.test(name)) return "read";
  if (/write|edit/i.test(name)) return "write";
  if (/bash|shell/i.test(name)) return "bash";
  if (/search|find/i.test(name)) return "search";
  return "other";
}

const categoryIcon = {
  read: FileText,
  write: Pencil,
  bash: Terminal,
  search: Search,
  other: Wrench,
} as const;

function summarize(input: unknown): string {
  const obj = input as Record<string, unknown> | null | undefined;
  if (!obj) return "";
  if (obj.file_path) return String(obj.file_path).split("/").pop() ?? "";
  if (obj.command) return String(obj.command).slice(0, 60);
  if (obj.pattern) return String(obj.pattern);
  return "";
}

type Props = {
  toolCalls: ToolCallState[];
};

export function ToolActionsGroup({ toolCalls }: Props) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const running = toolCalls.filter((tc) => tc.status === "running").length;
  const completed = toolCalls.filter((tc) => tc.status === "completed").length;

  const toggleToolDetail = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Collapsible defaultOpen={running > 0}>
      <CollapsibleTrigger className="mt-2 flex w-full items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronDown
          size={12}
          className="transition-transform [[data-panel-open]_&]:rotate-0 [[data-panel-closed]_&]:-rotate-90"
        />
        <span>
          {toolCalls.length} action{toolCalls.length !== 1 ? "s" : ""}
          {running > 0 && <span className="text-yellow-500"> · {running} running</span>}
          {completed > 0 && <span className="text-green-500"> · {completed} completed</span>}
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="mt-1 flex flex-col gap-0.5">
          {toolCalls.map((tc) => {
            const cat = categorize(tc.name);
            const Icon = categoryIcon[cat];
            const summary = summarize(tc.input);
            const isExpanded = expandedTools.has(tc.toolCallId);

            return (
              <div key={tc.toolCallId} className="rounded border border-border/50">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => tc.input && toggleToolDetail(tc.toolCallId)}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      tc.status === "completed"
                        ? "bg-green-500"
                        : tc.status === "error"
                          ? "bg-red-500"
                          : "bg-yellow-500",
                    )}
                  />
                  <Icon size={12} className="shrink-0" />
                  <span className="font-medium">{tc.name}</span>
                  {summary && (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground/60">
                      {summary}
                    </span>
                  )}
                </button>
                {isExpanded && tc.input != null && (
                  <pre className="max-h-32 overflow-auto border-t border-border/50 bg-background/50 px-2 py-1 text-[10px] text-muted-foreground">
                    {JSON.stringify(tc.input, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
