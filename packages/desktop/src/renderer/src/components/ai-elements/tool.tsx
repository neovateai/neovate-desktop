"use client";

import type { HugeIconProps } from "@hugeicons/react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, FC } from "react";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import {
  AiChat02Icon,
  BookOpen01Icon,
  ClipboardIcon,
  Copy01Icon,
  Download04Icon,
  File02Icon,
  FileAddIcon,
  FileEditIcon,
  GitBranchIcon,
  Globe02Icon,
  HelpCircleIcon,
  Layers01Icon,
  Logout01Icon,
  MagicWand01Icon,
  RoadmapIcon,
  Search01Icon,
  SquareIcon,
  Task01Icon,
  TerminalBrowserIcon,
  TextWrapIcon,
} from "@hugeicons/react";
import { isValidElement, useMemo } from "react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CodeBlock } from "./code-block";

// Tool type to icon and color mapping (following HugeIcons design spec)
const toolIconMap: Record<string, { icon: FC<HugeIconProps>; color: string }> = {
  // File operations
  Read: { icon: File02Icon, color: "text-blue-500" },
  Write: { icon: FileAddIcon, color: "text-emerald-500" },
  Edit: { icon: FileEditIcon, color: "text-amber-500" },
  MultiEdit: { icon: Copy01Icon, color: "text-orange-500" },

  // Notebook & Code
  NotebookEdit: { icon: BookOpen01Icon, color: "text-violet-500" },

  // System & Shell
  Bash: { icon: TerminalBrowserIcon, color: "text-slate-500" },

  // Search
  Glob: { icon: Search01Icon, color: "text-cyan-500" },
  Grep: { icon: TextWrapIcon, color: "text-indigo-500" },

  // Web
  WebSearch: { icon: Globe02Icon, color: "text-sky-500" },
  WebFetch: { icon: Download04Icon, color: "text-teal-500" },

  // User interaction
  AskUserQuestion: { icon: HelpCircleIcon, color: "text-pink-500" },

  // Task management
  TodoWrite: { icon: Task01Icon, color: "text-emerald-600" },
  Task: { icon: Layers01Icon, color: "text-orange-400" },
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
function getToolIconInfo(toolName: string): { icon: FC<HugeIconProps>; color: string } {
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
  return { icon: File02Icon, color: "text-muted-foreground" };
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
      "group/tool not-prose w-full overflow-hidden rounded-lg border border-border/50",
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
    "approval-requested": "bg-amber-500",
    "approval-responded": "bg-blue-500",
    "input-available": "bg-primary",
    "input-streaming": "bg-primary",
    "output-available": "bg-emerald-500",
    "output-denied": "bg-orange-500",
    "output-error": "bg-red-500",
  };

  // Running state uses primary color, non-running uses mapped color
  const colorClass = isRunning ? "bg-primary" : statusStyles[state] || "bg-muted-foreground";

  return <span className={cn("size-1.5 rounded-full shrink-0", colorClass)} />;
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
        "flex w-full items-center gap-2 h-7 px-2 rounded-md",
        "transition-colors duration-150",
        "hover:bg-muted/50 cursor-pointer group",
        className,
      )}
      {...props}
    >
      <TooltipProvider>
        {/* Icon - size-4, tool specific color */}
        <ToolIcon className={cn("size-4 shrink-0", iconColor)} variant="solid" />

        {/* Label Area */}
        <span className="flex items-center gap-1.5 text-sm min-w-0">
          {/* Action Name - medium weight main text */}
          <span className="font-medium text-foreground shrink-0">{mainLabel}</span>

          {/* Extra info (e.g., search patterns) */}
          {extra && <span className="text-muted-foreground"> {extra}</span>}

          {/* Separator - dot separator */}
          {hasFilePath && displayName && <span className="text-muted-foreground/40">·</span>}

          {/* File Name - gray secondary text, truncatable */}
          {hasFilePath && displayName && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="cursor-default">
                    <span className="text-muted-foreground truncate">{displayName}</span>
                  </span>
                }
              />
              <TooltipContent side="top" align="start" className="max-w-md">
                <p className="break-all text-xs">{fullPath}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Expand Indicator - HugeIcons ArrowDown01Icon */}
        <ArrowDown01Icon
          className={cn(
            "size-3 text-muted-foreground/50 shrink-0",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
            "transition-transform duration-200",
            "group-data-[state=open]:rotate-180",
          )}
          variant="solid"
        />

        {/* Status Dot - size-1.5, static no animation for non-running */}
        <StatusDot state={state} preliminary={preliminary} />
      </TooltipProvider>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "border-t border-border/40 overflow-hidden",
      "data-[state=closed]:animate-out data-[state=open]:animate-in",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1",
      "p-3 outline-none space-y-3",
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
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Input
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
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
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            errorText ? "text-red-500" : "text-muted-foreground",
          )}
        >
          {errorText ? "Error" : "Output"}
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>
      <div
        className={cn(
          "rounded-lg border overflow-hidden",
          errorText
            ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
            : "border-border/50 bg-background",
        )}
      >
        {errorText && <div className="p-3 text-sm">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
