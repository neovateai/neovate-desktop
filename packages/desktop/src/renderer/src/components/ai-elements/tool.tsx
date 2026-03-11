"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, ReactNode } from "react";

import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  Code2Icon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  HashIcon,
  ImageIcon,
  LucideProps,
  MusicIcon,
  TableIcon,
  WrenchIcon,
  XCircleIcon,
  FileIcon,
} from "lucide-react";
import { isValidElement } from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { CodeBlock } from "./code-block";

// 文件扩展名到图标的映射
const fileExtensionMap: Record<string, { icon: React.FC<LucideProps>; color: string }> = {
  // 代码文件
  ts: { icon: Code2Icon, color: "text-blue-500" },
  tsx: { icon: Code2Icon, color: "text-blue-500" },
  js: { icon: Code2Icon, color: "text-yellow-500" },
  jsx: { icon: Code2Icon, color: "text-yellow-500" },
  py: { icon: Code2Icon, color: "text-green-500" },
  go: { icon: Code2Icon, color: "text-cyan-500" },
  rs: { icon: Code2Icon, color: "text-orange-500" },
  java: { icon: Code2Icon, color: "text-red-500" },
  cpp: { icon: Code2Icon, color: "text-blue-600" },
  c: { icon: Code2Icon, color: "text-blue-600" },
  // 配置文件
  json: { icon: FileJsonIcon, color: "text-yellow-500" },
  yaml: { icon: FileTextIcon, color: "text-pink-500" },
  yml: { icon: FileTextIcon, color: "text-pink-500" },
  xml: { icon: Code2Icon, color: "text-orange-500" },
  toml: { icon: FileTextIcon, color: "text-green-500" },
  ini: { icon: FileTextIcon, color: "text-gray-500" },
  env: { icon: FileTextIcon, color: "text-green-600" },
  // 文档
  md: { icon: FileTextIcon, color: "text-blue-400" },
  txt: { icon: FileTextIcon, color: "text-gray-400" },
  // 数据
  csv: { icon: TableIcon, color: "text-green-500" },
  xlsx: { icon: TableIcon, color: "text-green-600" },
  xls: { icon: TableIcon, color: "text-green-600" },
  // 媒体
  png: { icon: ImageIcon, color: "text-purple-500" },
  jpg: { icon: ImageIcon, color: "text-purple-500" },
  jpeg: { icon: ImageIcon, color: "text-purple-500" },
  gif: { icon: ImageIcon, color: "text-purple-500" },
  svg: { icon: ImageIcon, color: "text-orange-500" },
  mp3: { icon: MusicIcon, color: "text-pink-500" },
  wav: { icon: MusicIcon, color: "text-pink-500" },
  // 其他
  lock: { icon: HashIcon, color: "text-gray-500" },
  gitignore: { icon: FolderIcon, color: "text-gray-600" },
  dockerfile: { icon: FolderIcon, color: "text-blue-500" },
};

// 获取文件扩展名
function getFileExtension(filePath: string): string {
  const match = filePath.match(/\.([^./\\]+)$/);
  return match ? match[1].toLowerCase() : "";
}

// 从文件路径获取文件名
function getFileName(filePath: string): string {
  const match = filePath.match(/[/\\]?([^/\\]+)$/);
  return match ? match[1] : filePath;
}

// 从文本中提取文件路径（支持多种格式）
// 1. "Read /path/to/file"
// 2. "Glob for "pattern" in /path/to/dir"
// 3. "Glob for "p1" in /dir for "p2""
function extractFilePath(text: string): { path: string; extra?: string } | null {
  // 找到所有绝对路径，取最后一个（通常是目标目录）
  const pathMatches = text.matchAll(/([A-Za-z]:[/\\]|)\/[^"\s]+/g);
  const paths = Array.from(pathMatches, (m) => m[0]);

  if (paths.length === 0) return null;

  const path = paths[paths.length - 1]; // 取最后一个路径

  // 提取所有的 for "pattern" 参数
  const forMatches = text.matchAll(/for\s+"([^"]+)"/g);
  const patterns = Array.from(forMatches, (m) => m[1]);

  const extras = patterns.map((p) => `for "${p}"`).join(" ");

  return { path, extra: extras || undefined };
}

// 解析工具标题，返回文件名和完整路径
function parseToolTitle(title?: string): {
  displayName: string;
  fullPath: string | null;
  toolName?: string;
  extra?: string;
} {
  if (!title) return { displayName: "", fullPath: null };

  const result = extractFilePath(title);

  if (result) {
    // 提取工具名（如果 title 包含工具名和路径）
    const toolName =
      title
        .replace(result.path, "")
        .replace(result.extra || "", "")
        .trim() || undefined;
    return {
      displayName: getFileName(result.path),
      fullPath: result.path,
      toolName,
      extra: result.extra,
    };
  }

  return { displayName: title, fullPath: null };
}

// 获取文件图标
function getFileIcon(filePath: string): React.FC<LucideProps> {
  const ext = getFileExtension(filePath);
  const fileType = fileExtensionMap[ext];
  return fileType?.icon ?? FileIcon;
}

// 获取文件图标颜色
function getFileIconColor(filePath: string): string {
  const ext = getFileExtension(filePath);
  const fileType = fileExtensionMap[ext];
  return fileType?.color ?? "text-muted-foreground";
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn("group not-prose w-full", className)} {...props} />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
  "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="gap-1.5 rounded-full text-xs border-0 bg-transparent text-muted-foreground">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
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
  const {
    displayName,
    fullPath,
    toolName: parsedToolName,
    extra,
  } = parseToolTitle(title ?? derivedName);
  const isFile = fullPath !== null;
  const FileIconComponent = isFile ? getFileIcon(fullPath) : WrenchIcon;
  const iconColor = isFile ? getFileIconColor(fullPath) : "text-muted-foreground";
  const displayToolName = parsedToolName || (isFile ? derivedName : undefined);

  const TitleComponent = (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-pink-400" />
        {displayToolName && <span className="font-normal text-sm">{displayToolName}</span>}
        {extra && <span className="font-normal text-sm">{extra}</span>}
        {isFile && (
          <>
            <FileIconComponent className={cn("size-4", iconColor)} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="font-normal text-sm text-muted-foreground cursor-default">
                    {displayName}
                  </span>
                }
              />
              <TooltipContent side="top" align="start" className="max-w-md">
                <p className="break-all">{fullPath}</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
        {!isFile && <span className="font-medium text-sm">{displayName}</span>}
        {getStatusBadge(state)}
      </div>
    </TooltipProvider>
  );

  return (
    <CollapsibleTrigger className={cn("flex w-full items-center gap-4", className)} {...props}>
      {TitleComponent}
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
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

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
