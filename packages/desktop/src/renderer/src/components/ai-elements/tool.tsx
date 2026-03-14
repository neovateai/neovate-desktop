"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { LucideProps } from "lucide-react";
import type { ComponentProps } from "react";

import {
  BookOpen,
  Bot,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Download,
  FileEdit,
  FilePlus,
  FileText,
  Files,
  GitBranch,
  Globe,
  HelpCircle,
  ListTodo,
  LogOut,
  Map,
  Regex,
  Search,
  Square,
  Terminal,
  Wand2,
  FileIcon,
} from "lucide-react";
import { isValidElement, useMemo } from "react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CodeBlock } from "./code-block";

// Tool type to icon and color mapping (following design spec)
const toolIconMap: Record<string, { icon: React.FC<LucideProps>; color: string }> = {
  // File operations
  Read: { icon: FileText, color: "text-blue-500" },
  Write: { icon: FilePlus, color: "text-green-500" },
  Edit: { icon: FileEdit, color: "text-amber-500" },
  MultiEdit: { icon: Files, color: "text-orange-500" },

  // Notebook & Code
  NotebookEdit: { icon: BookOpen, color: "text-purple-500" },

  // System & Shell
  Bash: { icon: Terminal, color: "text-slate-500" },

  // Search
  Glob: { icon: Search, color: "text-cyan-500" },
  Grep: { icon: Regex, color: "text-indigo-500" },

  // Web
  WebSearch: { icon: Globe, color: "text-sky-500" },
  WebFetch: { icon: Download, color: "text-teal-500" },

  // User interaction
  AskUserQuestion: { icon: HelpCircle, color: "text-violet-500" },

  // Task management
  TodoWrite: { icon: CheckSquare, color: "text-emerald-500" },
  Task: { icon: ListTodo, color: "text-pink-500" },
  TaskOutput: { icon: ClipboardList, color: "text-rose-500" },
  TaskStop: { icon: Square, color: "text-red-500" },

  // Agent & Skills
  Agent: { icon: Bot, color: "text-primary" },
  Skill: { icon: Wand2, color: "text-fuchsia-500" },

  // Plan mode
  EnterPlanMode: { icon: Map, color: "text-blue-400" },
  ExitPlanMode: { icon: LogOut, color: "text-gray-400" },

  // Worktree
  EnterWorktree: { icon: GitBranch, color: "text-orange-400" },
};

// Get tool icon info by name
function getToolIconInfo(toolName: string): { icon: React.FC<LucideProps>; color: string } {
  // Try exact match first
  if (toolIconMap[toolName]) {
    return toolIconMap[toolName];
  }

  // Try case-insensitive match
  const lowerToolName = toolName.toLowerCase();
  for (const [key, value] of Object.entries(toolIconMap)) {
    if (key.toLowerCase() === lowerToolName) {
      return value;
    }
  }

  // Default fallback
  return { icon: FileIcon, color: "text-muted-foreground" };
}

// Get filename from path
function getFileName(filePath: string): string {
  const match = filePath.match(/[/\\]?([^/\\]+)$/);
  return match ? match[1] : filePath;
}

// Extract file path from text
function extractFilePath(text: string): { path: string; extra?: string } | null {
  const pathMatches = text.matchAll(/(?:[A-Za-z]:[/\\])?\/[^"\s]+/g);
  const paths = Array.from(pathMatches, (m) => m[0]);

  if (paths.length === 0) return null;

  const path = paths[paths.length - 1];

  const forMatches = text.matchAll(/for\s+"([^"]+)"/g);
  const patterns = Array.from(forMatches, (m) => m[1]);

  const extras = patterns.map((p) => `for "${p}"`).join(" ");

  return { path, extra: extras || undefined };
}

// Parse tool title
function parseToolTitle(title?: string): {
  displayName: string;
  fullPath: string | null;
  actionName?: string;
  extra?: string;
} {
  if (!title) return { displayName: "", fullPath: null };

  const result = extractFilePath(title);

  if (result) {
    const actionName =
      title
        .replace(result.path, "")
        .replace(result.extra || "", "")
        .trim() || undefined;
    return {
      displayName: getFileName(result.path),
      fullPath: result.path,
      actionName,
      extra: result.extra,
    };
  }

  return { displayName: title, fullPath: null };
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group/tool not-prose w-full overflow-hidden rounded-md border border-border/50",
      className,
    )}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
  preliminary?: boolean;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

// Status dot component
const StatusDot = ({
  state,
  preliminary = false,
}: {
  state: ToolPart["state"];
  preliminary?: boolean;
}) => {
  const isRunning =
    state === "input-available" ||
    state === "input-streaming" ||
    (preliminary && state === "output-available");

  const statusStyles = {
    "approval-requested": "bg-yellow-500",
    "approval-responded": "bg-blue-500",
    "input-available": "bg-primary",
    "input-streaming": "bg-primary",
    "output-available": "bg-green-500",
    "output-denied": "bg-orange-500",
    "output-error": "bg-red-500",
  };

  if (isRunning) {
    return (
      <span className="relative flex size-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex rounded-full size-1.5 bg-primary" />
      </span>
    );
  }

  return (
    <span
      className={cn("size-1.5 rounded-full shrink-0", statusStyles[state] || "bg-muted-foreground")}
    />
  );
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  preliminary,
  ...props
}: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const { displayName, fullPath, actionName, extra } = useMemo(
    () => parseToolTitle(title ?? derivedName),
    [title, derivedName],
  );
  // Get tool icon based on derived name (e.g., "Read", "Write")
  const { icon: ToolIcon, color: iconColor } = useMemo(() => {
    const toolInfo = getToolIconInfo(derivedName);
    return toolInfo;
  }, [derivedName]);

  // Determine the label to display:
  // - If there's a file path, show action + filename
  // - If title was parsed with actionName, use that
  // - Otherwise use displayName or derivedName as fallback
  const hasFilePath = fullPath !== null;
  const mainLabel = hasFilePath
    ? actionName || derivedName
    : actionName || displayName || derivedName;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-md",
        "transition-colors cursor-pointer group w-full",
        className,
      )}
      {...props}
    >
      <TooltipProvider>
        {/* Icon with hover background */}
        <div className="relative flex items-center justify-center size-6 -ml-1 rounded-sm shrink-0 transition-colors group-hover:bg-muted">
          <ToolIcon className={cn("size-4", iconColor)} />
        </div>
        <span className="text-sm text-foreground truncate">
          {mainLabel}
          {extra && <span className="text-muted-foreground"> {extra}</span>}
          {/* Only show displayName separately when it's a file path */}
          {hasFilePath && displayName && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="cursor-default">
                    {extra ? "" : " "}
                    <span className="text-muted-foreground">{displayName}</span>
                  </span>
                }
              />
              <TooltipContent side="top" align="start" className="max-w-md">
                <p className="break-all">{fullPath}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        <StatusDot state={state} preliminary={preliminary} />
        {/* Micro chevron - shows on hover, rotates 180deg when open */}
        <div className="relative flex items-center justify-center size-4 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </TooltipProvider>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "border-t border-border/50",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-3 p-3 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5", className)} {...props}>
    <span className="text-xs font-medium text-muted-foreground">Input</span>
    <div className="rounded-md border border-border/50 bg-muted/30 overflow-hidden">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText?: ToolPart["errorText"];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as React.ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <span className="text-xs font-medium text-muted-foreground">
        {errorText ? "Error" : "Output"}
      </span>
      <div
        className={cn(
          "rounded-md border border-border/50 overflow-hidden",
          errorText ? "bg-destructive/10 text-destructive" : "bg-background",
        )}
      >
        {errorText && <div className="p-3 text-sm">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
