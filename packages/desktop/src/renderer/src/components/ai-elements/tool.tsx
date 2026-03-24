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
import { AnimatePresence, motion } from "motion/react";
import { isValidElement, useMemo } from "react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CodeBlock } from "./code-block";

// Tool type to icon mapping (unified muted color for cleaner visual)
const toolIconMap: Record<string, { icon: React.FC<LucideProps>; color: string }> = {
  // File operations
  Read: { icon: FileText, color: "text-muted-foreground" },
  Write: { icon: FilePlus, color: "text-muted-foreground" },
  Edit: { icon: FileEdit, color: "text-muted-foreground" },
  MultiEdit: { icon: Files, color: "text-muted-foreground" },

  // Notebook & Code
  NotebookEdit: { icon: BookOpen, color: "text-muted-foreground" },

  // System & Shell
  Bash: { icon: Terminal, color: "text-muted-foreground" },
  BashOutput: { icon: Terminal, color: "text-muted-foreground" },

  // Search
  Glob: { icon: Search, color: "text-muted-foreground" },
  Grep: { icon: Regex, color: "text-muted-foreground" },

  // Web
  WebSearch: { icon: Globe, color: "text-muted-foreground" },
  WebFetch: { icon: Download, color: "text-muted-foreground" },

  // User interaction
  AskUserQuestion: { icon: HelpCircle, color: "text-muted-foreground" },

  // Task management
  TodoWrite: { icon: CheckSquare, color: "text-muted-foreground" },
  Task: { icon: ListTodo, color: "text-muted-foreground" },
  TaskOutput: { icon: ClipboardList, color: "text-muted-foreground" },
  TaskStop: { icon: Square, color: "text-muted-foreground" },

  // Agent & Skills
  Agent: { icon: Bot, color: "text-muted-foreground" },
  Skill: { icon: Wand2, color: "text-muted-foreground" },
  SlashCommand: { icon: Wand2, color: "text-muted-foreground" },

  // Plan mode
  EnterPlanMode: { icon: Map, color: "text-muted-foreground" },
  ExitPlanMode: { icon: LogOut, color: "text-muted-foreground" },

  // Worktree
  EnterWorktree: { icon: GitBranch, color: "text-muted-foreground" },
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
    className={cn("group/tool not-prose w-full overflow-hidden rounded-md", className)}
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
const StatusDot = ({ state }: { state: ToolPart["state"]; preliminary?: boolean }) => {
  if (state !== "output-error") {
    return null;
  }

  return <span className="size-1.5 rounded-full shrink-0 bg-red-500" />;
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
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center justify-start gap-2 text-left transition-colors",
          className,
        )}
      >
        <CollapsibleTrigger
          className="inline-flex gap-2 flex-none w-max shrink-0 appearance-none items-center justify-start cursor-pointer bg-transparent p-0 m-0 border-0"
          style={{ width: "max-content" }}
          {...props}
        >
          <div className="relative flex size-4 shrink-0 items-center justify-center">
            <ToolIcon
              className={cn(
                "absolute size-4 transition-opacity duration-150 group-hover/tool:opacity-0",
                iconColor,
              )}
            />
            <ChevronDown className="absolute size-4 -rotate-90 text-muted-foreground opacity-0 transition-all duration-150 group-hover/tool:opacity-100 group-data-[open]/tool:rotate-0" />
          </div>

          <span className="min-w-0 truncate text-sm text-foreground">
            {mainLabel}&nbsp;
            {extra && <span className="text-muted-foreground"> {extra}</span>}
            {hasFilePath && displayName && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="cursor-default">
                      {extra ? "" : " "}
                      <span className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        {displayName}
                      </span>
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
        </CollapsibleTrigger>
      </div>
    </TooltipProvider>
  );
};

export type ToolContentProps = ComponentProps<"div">;

export const ToolContent = ({ className, children }: ToolContentProps) => (
  <CollapsiblePanel
    keepMounted
    render={(_panelProps, state) => (
      <AnimatePresence initial={false}>
        {state.open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.12 },
            }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "space-y-2 text-popover-foreground [--code-block-content-visibility:visible]",
                className,
              )}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5", className)} {...props}>
    <span className="text-xs font-medium text-muted-foreground">Input</span>
    <div className="rounded-md bg-muted/30 overflow-hidden">
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
          "rounded-md overflow-hidden",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/30",
        )}
      >
        {errorText && <div className="p-3 text-sm">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
