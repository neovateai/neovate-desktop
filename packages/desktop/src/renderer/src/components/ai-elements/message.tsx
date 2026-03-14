"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, FC, HTMLAttributes, ReactElement } from "react";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/react";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ButtonGroup, ButtonGroupText } from "../ui/group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

// ============================================================================
// Message - 消息容器
// ============================================================================

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full flex-col",
      from === "user" ? "is-user ml-auto justify-end max-w-[80%]" : "is-assistant max-w-full",
      className,
    )}
    {...props}
  />
);

// ============================================================================
// MessageContent - 消息内容（Markdown 样式 v3.0）
// ============================================================================

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * Markdown 样式规范 v3.0
 * - 字体: text-sm (14px)
 * - 行高: leading-6 (24px)
 * - 网格: 4px 基础间距系统
 * - 对齐: flex 布局确保严格对齐
 */
const markdownStyles = cn(
  // 基础排版 - 14px 字体，24px 行高（4px 网格对齐）
  "text-sm leading-6 text-foreground",
  "[&>p]:mb-3 [&>p:last-child]:mb-0",

  // 标题层级 - 严格 4px 网格间距
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-foreground",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:text-foreground",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-foreground",
  "[&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-muted-foreground",

  // 行内代码 - bg-muted, rounded (4px), px-1 py-0.5, text-xs (12px)
  "[&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:rounded",
  "[&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5",
  "[&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-xs",
  "[&_code:not(pre_code)]:text-foreground/90",

  // 无序列表 - flex 布局确保严格对齐
  "[&_ul]:list-none [&_ul]:pl-0 [&_ul]:my-3 [&_ul]:space-y-1",
  "[&_ul>li]:flex [&_ul>li]:items-start [&_ul>li]:gap-2",
  "[&_ul>li]:before:content-[''] [&_ul>li]:before:w-1 [&_ul>li]:before:h-1",
  "[&_ul>li]:before:rounded-full [&_ul>li]:before:bg-muted-foreground/50",
  "[&_ul>li]:before:mt-2.5 [&_ul>li]:before:shrink-0",

  // 有序列表 - 使用 list-item counter
  "[&_ol]:list-none [&_ol]:pl-0 [&_ol]:my-3 [&_ol]:space-y-1",
  "[&_ol]:[counter-reset:list-item]",
  "[&_ol>li]:flex [&_ol>li]:items-start [&_ol>li]:gap-2",
  "[&_ol>li]:before:content-[counter(list-item)] [&_ol>li]:before:[counter-increment:list-item]",
  "[&_ol>li]:before:text-xs [&_ol>li]:before:text-muted-foreground/70",
  "[&_ol>li]:before:min-w-[1.25rem] [&_ol>li]:before:text-right [&_ol>li]:before:shrink-0",

  // 任务列表
  "[&_li:has(>input[type=checkbox])]:pl-0",
  "[&_li>input[type=checkbox]]:mr-2 [&_li>input[type=checkbox]]:align-middle [&_li>input[type=checkbox]]:accent-primary",

  // 引用块 - 左边框 + 微妙背景
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/20",
  "[&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:my-3",
  "[&_blockquote]:text-muted-foreground",
  "[&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r-md [&_blockquote]:pr-3",

  // 链接 - 下划线样式
  "[&_a]:text-primary [&_a]:font-medium",
  "[&_a]:underline [&_a]:underline-offset-2",
  "[&_a]:decoration-primary/30",
  "[&_a]:hover:decoration-primary",

  // 表格 - 严格对齐
  "[&_table]:block [&_table]:my-3 [&_table]:overflow-hidden",
  "[&_table]:rounded-lg [&_table]:border [&_table]:border-border/50",
  "[&_thead]:bg-muted/50",
  "[&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
  "[&_th]:text-xs [&_th]:text-muted-foreground [&_th]:uppercase [&_th]:tracking-wider",
  "[&_th]:border-b [&_th]:border-border/50",
  "[&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_td]:text-foreground",
  "[&_td]:border-b [&_td]:border-border/30",
  "[&_tr:last-child_td]:border-b-0",

  // 水平分隔线
  "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-border/60",

  // 图片
  "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
  "[&_img]:my-3 [&_img]:border [&_img]:border-border/50",
);

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden",
      // User 消息样式 - 的气泡，使用 bg-secondary
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-2xl group-[.is-user]:rounded-tr-sm",
      "group-[.is-user]:bg-secondary group-[.is-user]:text-secondary-foreground",
      "group-[.is-user]:px-4 group-[.is-user]:py-2",
      // Assistant 消息样式 - 全宽
      "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      // Markdown 样式
      markdownStyles,
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

// ============================================================================
// MessageActions - 消息操作
// ============================================================================

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div
    className={cn(
      "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

// ============================================================================
// MessageBranch - 消息分支切换
// ============================================================================

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(null);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error("MessageBranch components must be used within MessageBranch");
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange],
  );

  const goToPrevious = useCallback(() => {
    const newBranch = currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch = currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious],
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div className={cn("grid w-full gap-2 [&>div]:pb-0", className)} {...props} />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({ children, ...props }: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children],
  );

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden",
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

export const MessageBranchSelector = ({ className, ...props }: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({ children, ...props }: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ArrowLeft01Icon className="size-3.5" />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({ children, ...props }: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ArrowRight01Icon className="size-3.5" />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({ className, ...props }: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn("border-none bg-transparent text-muted-foreground shadow-none", className)}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

// ============================================================================
// MessageResponse - 流式 Markdown 渲染器（使用相同样式）
// ============================================================================

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse: FC<MessageResponseProps> = memo<MessageResponseProps>(
  ({ className, ...props }) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // 使用与 MessageContent 相同的 Markdown 样式
        markdownStyles,
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";

// ============================================================================
// MessageToolbar - 消息工具栏
// ============================================================================

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({ className, children, ...props }: MessageToolbarProps) => (
  <div className={cn("mt-3 flex w-full items-center justify-between gap-4", className)} {...props}>
    {children}
  </div>
);
