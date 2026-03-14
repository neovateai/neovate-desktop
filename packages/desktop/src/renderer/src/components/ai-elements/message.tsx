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

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm leading-relaxed",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-2xl group-[.is-user]:rounded-tr-sm group-[.is-user]:bg-background group-[.is-user]:px-4 group-[.is-user]:py-2.5 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      // v3.0 Markdown Styles
      // Base typography
      "text-[15px] leading-7 text-foreground tracking-[-0.01em]",
      // Paragraph spacing
      "[&>p]:mb-4 [&>p:last-child]:mb-0",
      // Headings - updated sizes and spacing
      "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:tracking-tight",
      "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:tracking-tight",
      "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2",
      "[&_h4]:text-base [&_h4]:font-medium [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-muted-foreground",
      // Inline code - v3.0: bg-muted/60, rounded-md, px-1.5, text-[13px]
      "[&_code:not(pre_code)]:bg-muted/60 [&_code:not(pre_code)]:rounded-md",
      "[&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5",
      "[&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[13px]",
      "[&_code:not(pre_code)]:text-foreground/90",
      // Unordered lists - v3.0: custom bullets
      "[&_ul]:list-none [&_ul]:pl-0 [&_ul]:space-y-2 [&_ul]:my-4",
      "[&_ul>li]:relative [&_ul>li]:pl-5",
      "[&_ul>li]:before:content-[''] [&_ul>li]:before:absolute [&_ul>li]:before:left-1.5 [&_ul>li]:before:top-[0.6em]",
      "[&_ul>li]:before:w-1 [&_ul>li]:before:h-1 [&_ul>li]:before:rounded-full [&_ul>li]:before:bg-muted-foreground/60",
      // Ordered lists - v3.0: custom numbers with CSS counter
      "[&_ol]:list-none [&_ol]:pl-0 [&_ol]:space-y-2 [&_ol]:my-4",
      "[&_ol]:counter-reset-[item]",
      "[&_ol>li]:relative [&_ol>li]:pl-6",
      "[&_ol>li]:before:content-[counter(item)] [&_ol>li]:before:counter-increment-item",
      "[&_ol>li]:before:absolute [&_ol>li]:before:left-0 [&_ol>li]:before:top-0",
      "[&_ol>li]:before:text-xs [&_ol>li]:before:font-medium [&_ol>li]:before:text-muted-foreground/70",
      // Task lists
      "[&_li:has(>input[type=checkbox])]:pl-0",
      "[&_li>input[type=checkbox]]:mr-2 [&_li>input[type=checkbox]]:align-middle [&_li>input[type=checkbox]]:accent-primary",
      // Blockquote - v3.0: left border + subtle background
      "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/30",
      "[&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:my-4",
      "[&_blockquote]:text-muted-foreground [&_blockquote]:italic",
      "[&_blockquote]:bg-muted/20 [&_blockquote]:rounded-r-md [&_blockquote]:pr-3",
      // Links - v3.0: border-bottom style
      "[&_a]:text-primary [&_a]:font-medium [&_a]:no-underline",
      "[&_a]:border-b [&_a]:border-primary/30",
      "[&_a]:transition-all [&_a]:duration-200",
      "[&_a]:hover:border-primary [&_a]:hover:text-primary",
      // Tables - v3.0: updated styling with hover
      "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
      "[&_th]:bg-muted/50 [&_th]:text-left [&_th]:font-semibold",
      "[&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider",
      "[&_th]:text-muted-foreground [&_th]:border-b [&_th]:border-border",
      "[&_td]:px-4 [&_td]:py-2.5 [&_td]:text-[15px] [&_td]:text-foreground",
      "[&_td]:border-b [&_td]:border-border/50",
      "[&_tr:last-child_td]:border-b-0",
      "[&_tr:hover]:bg-muted/25",
      // Horizontal rule
      "[&_hr]:my-6 [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-border/70",
      // Images
      "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
      "[&_img]:my-4 [&_img]:border [&_img]:border-border/50 [&_img]:shadow-sm",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

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

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse: FC<MessageResponseProps> = memo<MessageResponseProps>(
  ({ className, ...props }) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // v3.0 Markdown Styles for Streamdown
        // Base typography
        "text-[15px] leading-7 text-foreground tracking-[-0.01em]",
        // Paragraph spacing
        "[&_p]:mb-4 [&_p:last-child]:mb-0",
        // Headings - updated sizes and spacing
        "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:tracking-tight",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:tracking-tight",
        "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2",
        "[&_h4]:text-base [&_h4]:font-medium [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-muted-foreground",
        // Inline code - v3.0
        "[&_code:not(pre_code)]:bg-muted/60 [&_code:not(pre_code)]:rounded-md",
        "[&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5",
        "[&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[13px]",
        "[&_code:not(pre_code)]:text-foreground/90",
        // Unordered lists - v3.0: custom bullets
        "[&_ul]:list-none [&_ul]:pl-0 [&_ul]:space-y-2 [&_ul]:my-4",
        "[&_ul>li]:relative [&_ul>li]:pl-5",
        "[&_ul>li]:before:content-[''] [&_ul>li]:before:absolute [&_ul>li]:before:left-1.5 [&_ul>li]:before:top-[0.6em]",
        "[&_ul>li]:before:w-1 [&_ul>li]:before:h-1 [&_ul>li]:before:rounded-full [&_ul>li]:before:bg-muted-foreground/60",
        // Ordered lists - v3.0
        "[&_ol]:list-none [&_ol]:pl-0 [&_ol]:space-y-2 [&_ol]:my-4",
        "[&_ol]:counter-reset-[item]",
        "[&_ol>li]:relative [&_ol>li]:pl-6",
        "[&_ol>li]:before:content-[counter(item)] [&_ol>li]:before:counter-increment-item",
        "[&_ol>li]:before:absolute [&_ol>li]:before:left-0 [&_ol>li]:before:top-0",
        "[&_ol>li]:before:text-xs [&_ol>li]:before:font-medium [&_ol>li]:before:text-muted-foreground/70",
        // Task lists
        "[&_li:has(>input[type=checkbox])]:pl-0",
        "[&_li>input[type=checkbox]]:mr-2 [&_li>input[type=checkbox]]:align-middle [&_li>input[type=checkbox]]:accent-primary",
        // Blockquote - v3.0
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/30",
        "[&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:my-4",
        "[&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        "[&_blockquote]:bg-muted/20 [&_blockquote]:rounded-r-md [&_blockquote]:pr-3",
        // Links - v3.0: border-bottom style
        "[&_a]:text-primary [&_a]:font-medium [&_a]:no-underline",
        "[&_a]:border-b [&_a]:border-primary/30",
        "[&_a]:transition-all [&_a]:duration-200",
        "[&_a]:hover:border-primary [&_a]:hover:text-primary",
        // Tables - v3.0
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:bg-muted/50 [&_th]:text-left [&_th]:font-semibold",
        "[&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider",
        "[&_th]:text-muted-foreground [&_th]:border-b [&_th]:border-border",
        "[&_td]:px-4 [&_td]:py-2.5 [&_td]:text-[15px] [&_td]:text-foreground",
        "[&_td]:border-b [&_td]:border-border/50",
        "[&_tr:last-child_td]:border-b-0",
        "[&_tr:hover]:bg-muted/25",
        // Horizontal rule
        "[&_hr]:my-6 [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-border/70",
        // Images
        "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
        "[&_img]:my-4 [&_img]:border [&_img]:border-border/50 [&_img]:shadow-sm",
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({ className, children, ...props }: MessageToolbarProps) => (
  <div className={cn("mt-3 flex w-full items-center justify-between gap-4", className)} {...props}>
    {children}
  </div>
);
