"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps } from "react";

import {
  File02Icon,
  FileAddIcon,
  FileEditIcon,
  Files01Icon,
  BookOpen01Icon,
  TerminalIcon,
  Search01Icon,
  TextWrapIcon,
  GlobeIcon,
  Download04Icon,
  HelpCircleIcon,
  CheckmarkCircle02Icon,
  Note01Icon,
  ClipboardIcon,
  SquareIcon,
  AiChat02Icon,
  MagicWand01Icon,
  RoadmapIcon,
  Logout01Icon,
  GitBranchIcon,
  ArrowDown01Icon,
  File01Icon,
} from "@hugeicons/react";
import { isValidElement, useMemo } from "react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CodeBlock } from "./code-block";

// Tool type to icon and color mapping (v3.0 design spec)
const toolIconMap: Record<string, { icon: React.FC<{ className?: string; variant?: string }>; color: string }> = {
  // File operations
  Read: { icon: File02Icon, color: "text-blue-500" },
  Write: { icon: FileAddIcon, color: "text-green-500" },
  Edit: { icon: FileEditIcon, color: "text-amber-500" },
  MultiEdit: { icon: Files01Icon, color: "text-orange-500" },

  // Notebook & Code
  NotebookEdit: { icon: BookOpen01Icon, color: "text-purple-500" },

  // System & Shell
  Bash: { icon: TerminalIcon, color: "text-slate-500" },

  // Search
  Glob: { icon: Search01Icon, color: "text-cyan-500" },
  Grep: { icon: TextWrapIcon, color: "text-indigo-500" },

  // Web
  WebSearch: { icon: GlobeIcon, color: "text-sky-500" },
  WebFetch: { icon: Download04Icon, color: "text-teal-500" },

  // User interaction
  AskUserQuestion: { icon: HelpCircleIcon, color: "text-violet-500" },

  // Task management
  TodoWrite: { icon: CheckmarkCircle02Icon, color: "text-emerald-500" },
  Task: { icon: Note01Icon, color: "text-pink-500" },
  TaskOutput: { icon: ClipboardIcon, color: "text-rose-500" },
  TaskStop: { icon: SquareIcon, color: "text-red-500" },

  // Agent & Skills
  Agent: { icon: AiChat02Icon, color: "text-primary" },
  Skill: { icon: MagicWand01Icon, color: "text-fuchsia-500" },

  // Plan mode
  EnterPlanMode: { icon: RoadmapIcon, color: "text-blue-400" },
  ExitPlanMode: { icon: Logout01Icon, color: "text-gray-400" },

  // Worktree
  EnterWorktree: { icon: GitBranchIcon, color: "text-orange-400" },
};

// Get tool icon info by name
function getToolIconInfo(toolName: string): { icon: React.FC<{ className?: string; variant?: string }>; color: string } {
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
  return { icon: File01Icon, color: "text-muted-foreground" };
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
      "group/tool not-prose w-full overflow-hidden rounded-md border border-border/40",
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

// Status dot component - v3.0: static color dots, no animation
const statusStyles = {
  "approval-requested": "bg-amber-500",
  "approval-responded": "bg-blue-500",
  "input-available": "bg-primary",
  "input-streaming": "bg-primary",
  "output-available": "bg-green-500",
  "output-denied": "bg-orange-500",
  "output-error": "bg-red-500",
  "running": "bg-primary",
};

const StatusDot = ({
  state,
}: {
  state: ToolPart["state"];
}) => (
  <span
    className={cn("size-1.5 rounded-full shrink-0", statusStyles[state] || "bg-muted-foreground")}
  />
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const { displayName, fullPath, actionName } = useMemo(
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
  const actionText = actionName || derivedName;

  return (
    <CollapsibleTrigger
      className={cn(
        // Layout - v3.0 spec: h-7, px-2 py-1
        "flex w-full items-center gap-2 h-7 px-2 py-1 rounded-md",
        // Interaction
        "transition-colors duration-150 ease-out",
        "hover:bg-muted/40 cursor-pointer group/tool",
        className,
      )}
      {...props}
    >
      {/* Icon Container with micro chevron */}
      <span className="relative flex items-center justify-center shrink-0">
        <ToolIcon
          className={cn("size-4", iconColor)}
          variant="solid"
        />
        {/* Expand Indicator - subtle hint */}
        <ArrowDown01Icon
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2.5",
            "bg-background rounded-full",
            "text-muted-foreground/70",
            "opacity-0 group-hover/tool:opacity-100",
            "transition-all duration-150",
            "group-data-[state=open]:rotate-180"
          )}
        />
      </span>

      {/* Label Area */}
      <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm">
        {/* Action Name */}
        <span className="text-foreground font-medium truncate">
          {actionText}
        </span>

        {/* Separator - only show when both action and displayName exist */}
        {actionText && displayName && (
          <span className="text-muted-foreground/50">·</span>
        )}

        {/* File/Subject Name */}
        {displayName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground truncate">
                {displayName}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              <p className="break-all text-xs">{fullPath}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </span>

      {/* Status Indicator - static color dot */}
      <StatusDot state={state} />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "border-t border-border/40",
      "data-[state=closed]:animate-out data-[state=open]:animate-in",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1.5",
      "data-[state=open]:slide-in-from-top-1.5",
      "space-y-3 p-3 text-popover-foreground outline-none",
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
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Input
      </span>
      <div className="flex-1 h-px bg-border/30" />
    </div>
    <div className="rounded-md border border-border/50 bg-muted/25 overflow-hidden">
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
      <div className="flex items-center gap-2">
        <span className={cn(
          "text-[11px] font-medium uppercase tracking-wide",
          errorText ? "text-destructive" : "text-muted-foreground"
        )}>
          {errorText ? "Error" : "Output"}
        </span>
        <div className="flex-1 h-px bg-border/30" />
      </div>
      <div
        className={cn(
          "rounded-md border overflow-hidden",
          errorText
            ? "border-destructive/30 bg-destructive/5"
            : "border-border/50 bg-background"
        )}
      >
        {errorText && <div className="p-3 text-sm text-destructive">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
