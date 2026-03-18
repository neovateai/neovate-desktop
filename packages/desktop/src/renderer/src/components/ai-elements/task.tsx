"use client";

import type { ComponentProps } from "react";

import { ChevronDownIcon, SearchIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";

export type TaskItemFileProps = ComponentProps<"div">;

export const TaskItemFile = ({ children, className, ...props }: TaskItemFileProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-muted-foreground text-xs",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type TaskItemProps = ComponentProps<"div">;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div className={cn("text-muted-foreground text-sm", className)} {...props}>
    {children}
  </div>
);

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({ defaultOpen = true, className, ...props }: TaskProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

export const TaskTrigger = ({ children, className, title, ...props }: TaskTriggerProps) => (
  <CollapsibleTrigger className={cn("group", className)} {...props}>
    {children ?? (
      <div className="flex w-full cursor-pointer items-center gap-2 py-1.5 px-2 rounded-md text-muted-foreground text-sm transition-colors hover:bg-muted/50 hover:text-foreground">
        <div className="relative flex items-center justify-center size-6 -ml-1 rounded-sm shrink-0">
          <SearchIcon className="size-4" />
        </div>
        <p className="text-sm">{title}</p>
        <ChevronDownIcon className="size-3 ml-auto transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
      </div>
    )}
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({ children, className, ...props }: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  >
    <div className="pl-7 py-2 pr-3 space-y-2">{children}</div>
  </CollapsibleContent>
);
