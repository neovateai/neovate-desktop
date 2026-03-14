"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps } from "react";

import {
  File02Icon,
  FileAddIcon,
  FileEditIcon,
  Copy01Icon,
  BookOpen01Icon,
  TerminalBrowserIcon,
  Search01Icon,
  TextWrapIcon,
  Globe02Icon,
  Download04Icon,
  HelpCircleIcon,
  Task01Icon,
  Layers01Icon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { CodeBlock } from "./code-block";

// ============================================================================
// Tool Icon Mapping - v3.0 Design Spec
// ============================================================================

const toolIconMap: Record<string, { icon: React.FC<{ className?: string; variant?: string }>; color: string }> = {
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

// ============================================================================
// Utilities
// ============================================================================

function getFileName(filePath: string): string {
  const match = filePath.match(/[/\\]?([^/\\]+)$/);
  return match ? match[1] : filePath;
}

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

// ============================================================================
// Tool Container
// ============================================================================

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "w-full overflow-hidden rounded-lg border border-border/40",
      className,
    )}
    {...props}
  />
);

// ============================================================================
// Tool Header - v3.0 Spec: h-7 (28px), px-2
// ============================================================================

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

// Status dot component - v3.0: static color dots, size-1.5 (6px)
const statusStyles: Record<string, string> = {
  "approval-requested": "bg-amber-500",
  "approval-responded": "bg-blue-500",
  "input-available": "bg-primary",
  "input-streaming": "bg-primary",
  "output-available": "bg-emerald-500",
  "output-denied": "bg-orange-500",
  "output-error": "bg-red-500",
  running: "bg-primary",
};

const StatusDot = ({ state }: { state: ToolPart["state"] }) => (
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

  const { icon: ToolIcon, color: iconColor } = useMemo(
    () => getToolIconInfo(derivedName),
    [derivedName],
  );

  // Determine labels
  const actionText = actionName || derivedName;

  return (
    <CollapsibleTrigger
      className={cn(
        // Layout - v3.0 spec: h-7 (28px), px-2
        "flex w-full items-center gap-2 h-7 px-2 rounded-md",
        // Interaction
        "transition-colors duration-150",
        "hover:bg-muted/50 cursor-pointer group/tool",
        className,
      )}
      {...props}
    >
      {/* Icon - size-4 (16px) */}
      <ToolIcon className={cn("size-4 shrink-0", iconColor)} variant="solid" />

      {/* Label Area */}
      <span className="flex items-center gap-1.5 text-sm min-w-0">
        {/* Action Name - 粗体主文字 */}
        {actionText && (
          <span className="font-medium text-foreground shrink-0">{actionText}</span>
        )}

        {/* Separator - 中点间隔符 */}
        {actionText && displayName && (
          <span className="text-muted-foreground/40">·</span>
        )}

        {/* File Name - 灰色副文字，可截断 */}
        {displayName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground truncate">{displayName}</span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              <p className="text-xs">{fullPath}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </span>

      {/* Spacer */}
      <span className="flex-1" />

      {/* Expand Indicator - 仅 hover 显示 */}
      <ArrowDown01Icon
        className={cn(
          "size-3 text-muted-foreground/50 opacity-0 group-hover/tool:opacity-100 transition-opacity duration-150 shrink-0",
        )}
      />

      {/* Status Dot - size-1.5 (6px)，静态无动画 */}
      <StatusDot state={state} />
    </CollapsibleTrigger>
  );
};

// ============================================================================
// Tool Content - v3.0 Spec: p-3 (12px)
// ============================================================================

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "border-t border-border/40 overflow-hidden",
      // Animation
      "data-[state=closed]:animate-out data-[state=open]:animate-in",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1",
      // Spacing - p-3 (12px)
      "p-3 outline-none",
      className,
    )}
    {...props}
  />
);

// ============================================================================
// Tool Input - v3.0 Spec: space-y-1.5 (6px)
// ============================================================================

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
    <div className="rounded-md border border-border/50 bg-muted/30 overflow-hidden">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

// ============================================================================
// Tool Output - v3.0 Spec: space-y-1.5 (6px)
// ============================================================================

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
          "rounded-md border overflow-hidden",
          errorText
            ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
            : "border-border/50 bg-background",
        )}
      >
        {errorText && <div className="p-3 text-sm text-red-500">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
